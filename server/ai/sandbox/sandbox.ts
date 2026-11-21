/**
 * Chat code sandbox: a QuickJS runtime per run, in a Worker.
 *
 * `read` / `write` / `list` are pure operations on the conversation's
 * in-memory text snapshot, so they never spawn a runtime. Only `run` starts a
 * Worker, which the parent terminates at SANDBOX_TIMEOUT_MS even if the VM is
 * stuck in a tight loop.
 */

import {
    describeError,
    MAX_FILE_CHARS,
    MAX_FILES,
    MAX_LOG_LINES,
    MAX_TOTAL_CHARS,
    normalizeSandboxPath,
    SANDBOX_TIMEOUT_MS,
    type SandboxResponse,
    sanitizeArtifacts,
    sanitizeFiles,
    validateSandboxCode,
} from "../lib/sandbox-protocol";

type WorkerResult = {
    result?: unknown;
    logs?: unknown;
    files?: unknown;
    artifacts?: unknown;
    error?: unknown;
    durationMs?: unknown;
};

export type SandboxService = {
    run: (request: {
        op: "run" | "read" | "write" | "list";
        language?: "javascript";
        code?: string;
        path?: string;
        content?: string;
        append?: boolean;
        files?: unknown;
    }) => Promise<SandboxResponse>;
    available: () => boolean;
    ensure: () => Promise<void>;
};

export function createSandboxService(
    options: { timeoutMs?: number } = {},
): SandboxService {
    const timeoutMs = options.timeoutMs ?? SANDBOX_TIMEOUT_MS;
    let ready = false;
    let ensuring: Promise<void> | null = null;

    async function ensure(): Promise<void> {
        if (ready) return;
        if (!ensuring) {
            ensuring = import("quickjs-emscripten")
                .then(() => {
                    ready = true;
                })
                .catch((error) => {
                    console.error("[sandbox] QuickJS failed to load", error);
                })
                .finally(() => {
                    ensuring = null;
                });
        }
        await ensuring;
    }

    function empty(
        files: Record<string, string>,
        error: string,
        started: number,
    ): SandboxResponse {
        return {
            ok: false,
            result: null,
            logs: [],
            files,
            artifacts: [],
            error,
            durationMs: Date.now() - started,
        };
    }

    function runInWorker(
        code: string,
        files: Record<string, string>,
        started: number,
    ): Promise<SandboxResponse> {
        return new Promise((resolve) => {
            const worker = new Worker(
                new URL("./sandbox-worker.ts", import.meta.url).href,
            );
            let settled = false;
            const finish = (response: SandboxResponse) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                worker.terminate();
                resolve(response);
            };
            const timer = setTimeout(() => {
                finish({
                    ...empty(
                        files,
                        `沙箱执行超时（${timeoutMs / 1000} 秒）`,
                        started,
                    ),
                });
            }, timeoutMs);

            worker.onmessage = (event: MessageEvent<WorkerResult>) => {
                const data = event.data ?? {};
                const error =
                    typeof data.error === "string" && data.error !== ""
                        ? data.error.slice(0, 500)
                        : "";
                const logs = Array.isArray(data.logs)
                    ? data.logs
                          .filter(
                              (line): line is string =>
                                  typeof line === "string",
                          )
                          .slice(0, MAX_LOG_LINES)
                    : [];
                finish({
                    ok: !error,
                    result: data.result ?? null,
                    logs,
                    files: sanitizeFiles(data.files),
                    artifacts: sanitizeArtifacts(data.artifacts),
                    ...(error ? { error } : {}),
                    durationMs:
                        typeof data.durationMs === "number" &&
                        Number.isFinite(data.durationMs)
                            ? data.durationMs
                            : Date.now() - started,
                });
            };
            worker.onerror = (event: ErrorEvent) => {
                finish(
                    empty(
                        files,
                        event.message || "沙箱执行失败，稍后再试",
                        started,
                    ),
                );
            };
            worker.postMessage({ code, files });
        });
    }

    async function run(
        request: Parameters<SandboxService["run"]>[0],
    ): Promise<SandboxResponse> {
        const started = Date.now();
        const files = sanitizeFiles(request.files);

        try {
            if (request.op === "read") {
                const path = normalizeSandboxPath(request.path);
                if (!path) throw new Error("文件路径不合法");
                return {
                    ok: true,
                    result: files[path] ?? null,
                    logs: [],
                    files,
                    artifacts: [],
                    durationMs: Date.now() - started,
                };
            }

            if (request.op === "write") {
                const path = normalizeSandboxPath(request.path);
                if (!path) throw new Error("文件路径不合法");
                if (typeof request.content !== "string") {
                    throw new Error("文件内容必须是字符串");
                }
                const existing = files[path];
                const content =
                    request.append === true && typeof existing === "string"
                        ? existing + request.content
                        : request.content;
                if (content.length > MAX_FILE_CHARS) {
                    throw new Error(`单个文件最多 ${MAX_FILE_CHARS} 个字符`);
                }
                const next = { ...files, [path]: content };
                const total = Object.values(next).reduce(
                    (sum, value) => sum + value.length,
                    0,
                );
                if (
                    Object.keys(next).length > MAX_FILES ||
                    total > MAX_TOTAL_CHARS
                ) {
                    throw new Error("沙箱文件总量超出上限");
                }
                return {
                    ok: true,
                    result: { path, size: content.length },
                    logs: [],
                    files: next,
                    artifacts: [],
                    durationMs: Date.now() - started,
                };
            }

            if (request.op === "list") {
                return {
                    ok: true,
                    result: Object.keys(files).sort(),
                    logs: [],
                    files,
                    artifacts: [],
                    durationMs: Date.now() - started,
                };
            }

            if (request.op !== "run") throw new Error("未知操作");
            const codeError = validateSandboxCode(request.code);
            if (codeError) throw new Error(codeError);
            if (!ready) await ensure();
            if (!ready) throw new Error("沙箱暂时不可用");

            return await runInWorker(request.code ?? "", files, started);
        } catch (error) {
            return empty(files, describeError(error), started);
        }
    }

    return { run, available: () => ready, ensure };
}
