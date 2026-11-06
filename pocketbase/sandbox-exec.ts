/**
 * Server-side code sandbox.
 *
 * Production runs each request in a fresh Docker container: Python code in
 * `mimi-sandbox-py` (python:3.12-slim) and JavaScript in `mimi-sandbox-js`
 * (node:22-alpine). Both use:
 * - a dedicated bridge network whose egress is restricted by
 *   `pocketbase/sandbox/docker-network.sh` (DNS + HTTP(S) to public IPs only)
 * - read-only root, tmpfs /tmp, non-root user, all capabilities dropped,
 *   no-new-privileges, PID/memory/CPU/file-descriptor limits
 * - the user's code arrives on stdin; it never appears in a command line
 * - a 20s wall-clock limit with an explicit `docker kill`
 *
 * Development (no Docker inside WSL) falls back to a plain `python3`/`node`
 * subprocess with a temporary directory. That fallback is **not** a
 * security boundary and is never used in production.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
    describeError,
    normalizeSandboxLanguage,
    normalizeSandboxPath,
    sanitizeFiles,
    validateSandboxCode,
    MAX_FILE_CHARS,
    SANDBOX_TIMEOUT_MS,
    type SandboxFiles,
    type SandboxLanguage,
    type SandboxRequest,
    type SandboxResponse,
} from "../lib/sandbox-protocol";

const MAX_STDOUT_BYTES = 256 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const DOCKER_TIMEOUT_MS = SANDBOX_TIMEOUT_MS;
const BUILD_TIMEOUT_MS = 240_000;
const RUNNER_PATH = {
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
};

export type SandboxExecutor = {
    /** Prepare the Docker network/images; safe to call more than once. */
    ensure: () => Promise<void>;
    available: () => boolean;
    run: (request: SandboxRequest) => Promise<SandboxResponse>;
};

export type SandboxExecutorOptions = {
    prod: boolean;
    /** The `pocketbase/` directory (contains `sandbox/`). */
    dir: string;
};

type Runtime = {
    language: SandboxLanguage;
    dockerfile: string;
    runner: string;
    baseImage: string;
    buildArg: string;
    tag: string;
};

/** Docker run flags; exported so tests can pin the security properties. */
export function buildDockerRunArgs(name: string, image: string): string[] {
    return [
        "docker",
        "run",
        "--rm",
        "-i",
        "--name",
        name,
        "--label",
        "mimi-sandbox=1",
        "--network",
        "mimi-sandbox",
        "--read-only",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=64m,mode=1777",
        "--workdir",
        "/tmp",
        "--user",
        "65534:65534",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        "--pids-limit",
        "64",
        "--memory",
        "256m",
        "--memory-swap",
        "256m",
        "--cpus",
        "0.5",
        "--ulimit",
        "nofile=256:256",
        "--ipc",
        "none",
        "--env",
        "HOME=/tmp",
        "--env",
        "LANG=C.UTF-8",
        "--env",
        languageEnv(image),
        image,
    ];
}

/** Python needs unbuffered stdout; Node needs no bytecode equivalent. */
function languageEnv(image: string): string {
    if (image.includes("-py:")) return "PYTHONUNBUFFERED=1";
    return "NODE_NO_WARNINGS=1";
}

function emptyResponse(
    files: SandboxFiles,
    error: string,
    durationMs = 0,
): SandboxResponse {
    return { ok: false, logs: [], files, error, durationMs };
}

async function readLimited(
    stream: ReadableStream<Uint8Array> | null,
    limit: number,
): Promise<string> {
    if (!stream) return "";
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || value.byteLength === 0) continue;
            if (total + value.byteLength > limit) {
                chunks.push(value.slice(0, limit - total));
                total = limit;
                await reader.cancel().catch(() => {});
                break;
            }
            chunks.push(value);
            total += value.byteLength;
        }
    } finally {
        reader.releaseLock?.();
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(
        "utf8",
    );
}

type CommandResult = { code: number; stdout: string; stderr: string };

async function runCommand(
    args: string[],
    timeoutMs: number,
): Promise<CommandResult> {
    const proc = Bun.spawn(args, {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: RUNNER_PATH,
    });
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const [stdout, stderr, code] = await Promise.all([
        readLimited(proc.stdout, MAX_STDOUT_BYTES),
        readLimited(proc.stderr, MAX_STDERR_BYTES),
        proc.exited,
    ]);
    clearTimeout(timer);
    return { code, stdout, stderr };
}

function validateRequest(request: SandboxRequest):
    | {
          ok: true;
          payload: Record<string, unknown>;
          files: SandboxFiles;
          language: SandboxLanguage;
      }
    | { ok: false; error: string; files: SandboxFiles } {
    const files = sanitizeFiles(request.files);
    const language = normalizeSandboxLanguage(request.language);
    if (!language) {
        return { ok: false, error: "未知的代码语言", files };
    }
    if (
        request.op !== "run" &&
        request.op !== "read" &&
        request.op !== "write" &&
        request.op !== "list"
    ) {
        return { ok: false, error: "未知操作", files };
    }
    if (request.op === "run") {
        const invalid = validateSandboxCode(request.code);
        if (invalid) return { ok: false, error: invalid, files };
        return {
            ok: true,
            files,
            language,
            payload: {
                op: "run",
                language,
                code: request.code,
                files,
            },
        };
    }
    if (request.op === "write") {
        const target = normalizeSandboxPath(request.path);
        if (!target) return { ok: false, error: "文件路径不合法", files };
        if (typeof request.content !== "string") {
            return { ok: false, error: "文件内容必须是字符串", files };
        }
        if (Array.from(request.content).length > MAX_FILE_CHARS) {
            return {
                ok: false,
                error: `单个文件最多 ${MAX_FILE_CHARS} 个字符`,
                files,
            };
        }
        return {
            ok: true,
            files,
            language,
            payload: {
                op: "write",
                language,
                path: target,
                content: request.content,
                files,
            },
        };
    }
    if (request.op === "read") {
        const target = normalizeSandboxPath(request.path);
        if (!target) return { ok: false, error: "文件路径不合法", files };
        return {
            ok: true,
            files,
            language,
            payload: { op: "read", language, path: target, files },
        };
    }
    return {
        ok: true,
        files,
        language,
        payload: { op: "list", language, files },
    };
}

function parseResponse(
    stdout: string,
    fallbackFiles: SandboxFiles,
    fallbackDurationMs: number,
): SandboxResponse {
    const text = stdout.trim();
    if (!text) {
        return emptyResponse(
            fallbackFiles,
            "沙箱没有返回结果，再试一次吧",
            fallbackDurationMs,
        );
    }
    try {
        const parsed = JSON.parse(text) as {
            ok?: unknown;
            result?: unknown;
            logs?: unknown;
            files?: unknown;
            error?: unknown;
            durationMs?: unknown;
        };
        if (typeof parsed.ok !== "boolean") throw new Error("invalid response");
        return {
            ok: parsed.ok,
            result: parsed.result,
            logs: Array.isArray(parsed.logs)
                ? parsed.logs
                      .filter(
                          (line): line is string => typeof line === "string",
                      )
                      .slice(0, 100)
                : [],
            files: sanitizeFiles(parsed.files),
            ...(typeof parsed.error === "string" && parsed.error !== ""
                ? { error: parsed.error.slice(0, 300) }
                : {}),
            durationMs:
                typeof parsed.durationMs === "number" &&
                Number.isFinite(parsed.durationMs)
                    ? Math.max(0, Math.round(parsed.durationMs))
                    : fallbackDurationMs,
        };
    } catch {
        return emptyResponse(
            fallbackFiles,
            "沙箱返回的格式不正确，再试一次吧",
            fallbackDurationMs,
        );
    }
}

function imageTag(runtime: {
    language: SandboxLanguage;
    baseImage: string;
    dockerfile: string;
    runner: string;
}): string {
    const hash = createHash("sha256");
    hash.update(runtime.language);
    hash.update(runtime.baseImage);
    for (const file of [runtime.runner, runtime.dockerfile]) {
        hash.update(readFileSync(file));
    }
    return `mimi-sandbox-${runtime.language === "python" ? "py" : "js"}:${hash
        .digest("hex")
        .slice(0, 12)}`;
}

export function createSandboxExecutor({
    prod,
    dir,
}: SandboxExecutorOptions): SandboxExecutor {
    const sandboxDir = path.join(dir, "sandbox");
    const networkScript = path.join(sandboxDir, "docker-network.sh");
    const runs: Record<SandboxLanguage, Runtime> = {
        python: {
            language: "python",
            dockerfile: path.join(sandboxDir, "Dockerfile"),
            runner: path.join(sandboxDir, "runner.py"),
            baseImage:
                process.env.SANDBOX_BASE_IMAGE?.trim() || "python:3.12-slim",
            buildArg: "PYTHON_IMAGE",
            tag: "",
        },
        javascript: {
            language: "javascript",
            dockerfile: path.join(sandboxDir, "Dockerfile.node"),
            runner: path.join(sandboxDir, "runner.mjs"),
            baseImage:
                process.env.SANDBOX_BASE_IMAGE_NODE?.trim() || "node:22-alpine",
            buildArg: "NODE_IMAGE",
            tag: "",
        },
    };
    runs.python.tag = imageTag(runs.python);
    runs.javascript.tag = imageTag(runs.javascript);

    const docker = Bun.which("docker");
    const python = Bun.which("python3");
    const node = Bun.which("node");

    const dockerReady = new Set<SandboxLanguage>();
    const devReady = new Set<SandboxLanguage>();
    let ensuring: Promise<void> | null = null;

    function logBuild(language: SandboxLanguage, error: string): void {
        console.error(
            `[sandbox] ${language} image build failed: ${error.slice(0, 300)}`,
        );
    }

    async function prepareLanguage(runtime: Runtime): Promise<void> {
        if (!docker) return;
        const inspect = await runCommand(
            [docker, "image", "inspect", runtime.tag],
            10_000,
        );
        if (inspect.code !== 0) {
            const build = await runCommand(
                [
                    docker,
                    "build",
                    "--build-arg",
                    `${runtime.buildArg}=${runtime.baseImage}`,
                    "-f",
                    runtime.dockerfile,
                    "--label",
                    "mimi-sandbox=1",
                    "-t",
                    runtime.tag,
                    sandboxDir,
                ],
                BUILD_TIMEOUT_MS,
            );
            if (build.code !== 0) {
                logBuild(runtime.language, build.stderr || build.stdout);
                return;
            }
        }
        dockerReady.add(runtime.language);
    }

    async function prepareDocker(): Promise<void> {
        if (!docker) {
            console.error(
                "[sandbox] docker is not installed; server sandbox disabled",
            );
            return;
        }
        const info = await runCommand([docker, "info"], 10_000);
        if (info.code !== 0) {
            console.error("[sandbox] docker daemon is not reachable");
            return;
        }
        const network = await runCommand(
            ["bash", networkScript],
            BUILD_TIMEOUT_MS,
        );
        if (network.code !== 0) {
            console.error(
                "[sandbox] network setup failed:",
                network.stderr.slice(0, 300),
            );
            return;
        }
        await Promise.all([
            prepareLanguage(runs.python),
            prepareLanguage(runs.javascript),
        ]);
        console.log(
            `[sandbox] ready languages: ${
                [...dockerReady].join(", ") || "none"
            }`,
        );
    }

    async function ensure(): Promise<void> {
        if (ensuring) return ensuring;
        ensuring = (async () => {
            if (prod) {
                await prepareDocker();
                return;
            }
            if (python) devReady.add("python");
            if (node) devReady.add("javascript");
            console.warn(
                `[sandbox] dev mode: direct runtimes (${
                    [python ? "python" : "", node ? "node" : ""]
                        .filter(Boolean)
                        .join(", ") || "none"
                }); not isolated`,
            );
        })();
        try {
            await ensuring;
        } finally {
            ensuring = null;
        }
    }

    function canRun(language: SandboxLanguage): boolean {
        return prod ? dockerReady.has(language) : devReady.has(language);
    }

    async function runDocker(
        runtime: Runtime,
        payload: Record<string, unknown>,
        inputFiles: SandboxFiles,
    ): Promise<SandboxResponse> {
        if (!docker) {
            return emptyResponse(inputFiles, "站点沙箱暂时不可用");
        }
        const name = `mimi-sandbox-${randomUUID().slice(0, 8)}`;
        const started = Date.now();
        const proc = Bun.spawn(buildDockerRunArgs(name, runtime.tag), {
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
            env: RUNNER_PATH,
        });

        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            void runCommand([docker, "kill", name], 5_000).catch(() => {});
        }, DOCKER_TIMEOUT_MS);

        try {
            proc.stdin.write(JSON.stringify(payload));
            await proc.stdin.end();
            const [stdout, stderr, code] = await Promise.all([
                readLimited(proc.stdout, MAX_STDOUT_BYTES),
                readLimited(proc.stderr, MAX_STDERR_BYTES),
                proc.exited,
            ]);
            const duration = Date.now() - started;
            if (timedOut) {
                return emptyResponse(
                    inputFiles,
                    `沙箱执行超时（${Math.round(
                        SANDBOX_TIMEOUT_MS / 1000,
                    )} 秒）`,
                    duration,
                );
            }
            const response = parseResponse(stdout, inputFiles, duration);
            if (!response.ok && !response.error && code !== 0) {
                response.error = `沙箱执行失败（退出码 ${code}）`;
            }
            if (!stdout.trim() && stderr.trim()) {
                console.error(
                    "[sandbox] docker run failed:",
                    stderr.slice(0, 300),
                );
            }
            return response;
        } finally {
            clearTimeout(timer);
            void runCommand([docker, "rm", "-f", name], 5_000).catch(() => {});
        }
    }

    async function runDirect(
        runtime: Runtime,
        payload: Record<string, unknown>,
        inputFiles: SandboxFiles,
    ): Promise<SandboxResponse> {
        const executable = runtime.language === "python" ? python : node;
        if (!executable) {
            return emptyResponse(inputFiles, "站点沙箱暂时不可用");
        }
        const workDir = mkdtempSync(path.join(tmpdir(), "mimi-sandbox-"));
        const command =
            runtime.language === "python"
                ? [executable, "-I", "-B", runtime.runner]
                : [executable, runtime.runner];
        const started = Date.now();
        const proc = Bun.spawn(command, {
            cwd: workDir,
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
            env: {
                PATH: RUNNER_PATH.PATH,
                HOME: workDir,
                TMPDIR: workDir,
                LANG: "C.UTF-8",
                MIMI_SANDBOX_ROOT: path.join(workDir, "sandbox"),
            },
        });

        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill();
        }, SANDBOX_TIMEOUT_MS);

        try {
            proc.stdin.write(JSON.stringify(payload));
            await proc.stdin.end();
            const [stdout, , code] = await Promise.all([
                readLimited(proc.stdout, MAX_STDOUT_BYTES),
                readLimited(proc.stderr, MAX_STDERR_BYTES),
                proc.exited,
            ]);
            const duration = Date.now() - started;
            if (timedOut) {
                return emptyResponse(
                    inputFiles,
                    `沙箱执行超时（${Math.round(
                        SANDBOX_TIMEOUT_MS / 1000,
                    )} 秒）`,
                    duration,
                );
            }
            const response = parseResponse(stdout, inputFiles, duration);
            if (!response.ok && !response.error && code !== 0) {
                response.error = `沙箱执行失败（退出码 ${code}）`;
            }
            return response;
        } finally {
            clearTimeout(timer);
            rmSync(workDir, { recursive: true, force: true });
        }
    }

    async function run(request: SandboxRequest): Promise<SandboxResponse> {
        const checked = validateRequest(request);
        if (!checked.ok) {
            return emptyResponse(checked.files, checked.error);
        }
        if (!canRun(checked.language)) {
            await ensure();
        }
        if (!canRun(checked.language)) {
            return emptyResponse(
                checked.files,
                checked.language === "javascript"
                    ? "JavaScript 沙箱暂时不可用"
                    : "Python 沙箱暂时不可用",
            );
        }
        const runtime = runs[checked.language];
        try {
            return prod
                ? await runDocker(runtime, checked.payload, checked.files)
                : await runDirect(runtime, checked.payload, checked.files);
        } catch (error) {
            return emptyResponse(
                checked.files,
                `沙箱运行出错：${describeError(error)}`,
            );
        }
    }

    return {
        ensure,
        available: () => (prod ? dockerReady.size > 0 : devReady.size > 0),
        run,
    };
}
