/**
 * Trusted Node wrapper for the mimi-base sandbox.
 *
 * Runs inside the same hardened container as the Python runner (read-only
 * root, tmpfs /tmp, nobody, no capabilities, 60s, dedicated Docker network
 * with public-only egress). Reads one JSON request on stdin and prints one
 * JSON response on stdout.
 *
 * User code is an async function body: `return` a value (or assign to the
 * global `result`). `sandbox.read/write/list/remove` are synchronous helpers;
 * `sandbox.fetch(url)` is async and returns text.
 */

import {
    closeSync,
    openSync,
    readFileSync,
    readSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
    mkdirSync,
    realpathSync,
    unlinkSync,
} from "node:fs";
import path from "node:path";
import util from "node:util";

const ROOT = process.env.MIMI_SANDBOX_ROOT || "/tmp/sandbox";
const MAX_FILES = 40;
const MAX_FILE_CHARS = 100_000;
const MAX_TOTAL_CHARS = 400_000;
const MAX_LOG_CHARS = 20_000;
const MAX_LOG_LINES = 100;
const MAX_RESULT_CHARS = 20_000;
const MAX_ARTIFACTS = 3;
const MAX_ARTIFACT_BYTES = 1_500_000;
const MAX_ARTIFACT_TOTAL_BYTES = 3_000_000;
const USER_AGENT = "mimi-base-sandbox/1.0";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Only raster images the app renders in an `<img>`; SVG stays text. */
function sniffImageMime(data) {
    if (data.length >= 8 && data.subarray(0, 8).equals(PNG_MAGIC)) {
        return "image/png";
    }
    if (
        data.length >= 3 &&
        data[0] === 0xff &&
        data[1] === 0xd8 &&
        data[2] === 0xff
    ) {
        return "image/jpeg";
    }
    const head = data.subarray(0, 6).toString("latin1");
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
    if (
        data.length >= 12 &&
        data.subarray(0, 4).toString("latin1") === "RIFF" &&
        data.subarray(8, 12).toString("latin1") === "WEBP"
    ) {
        return "image/webp";
    }
    return null;
}

function normalizePath(value) {
    if (typeof value !== "string") return null;
    const cleaned = value.trim().replace(/^\.\//, "");
    if (cleaned === "" || cleaned.length > 200) return null;
    if (cleaned.startsWith("/") || cleaned.includes("\\")) return null;
    for (const char of cleaned) {
        const code = char.codePointAt(0) ?? 0;
        if (code < 32 || code === 127) return null;
    }
    const parts = cleaned.split("/");
    if (parts.some((part) => part === "" || part === "." || part === "..")) {
        return null;
    }
    return cleaned;
}

function insideRoot(full) {
    try {
        const root = realpathSync(ROOT);
        const target = realpathSync(full);
        return target === root || target.startsWith(`${root}${path.sep}`);
    } catch {
        // Missing files are still inside the root as long as the lexical
        // path is; the caller is about to create them.
        const root = path.resolve(ROOT);
        const target = path.resolve(full);
        return target === root || target.startsWith(`${root}${path.sep}`);
    }
}

function sanitizeFiles(raw) {
    const files = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return files;
    let total = 0;
    for (const [key, value] of Object.entries(raw).slice(0, MAX_FILES)) {
        const clean = normalizePath(key);
        if (!clean || typeof value !== "string") continue;
        const content = value.slice(0, MAX_FILE_CHARS);
        total += content.length;
        if (total > MAX_TOTAL_CHARS) break;
        files[clean] = content;
    }
    return files;
}

function materialize(files) {
    rmSync(ROOT, { recursive: true, force: true });
    mkdirSync(ROOT, { recursive: true });
    for (const [relative, content] of Object.entries(files)) {
        const full = path.join(ROOT, relative);
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, content, "utf8");
    }
}

/**
 * Split the sandbox directory into text files and binary image artifacts.
 * Raster images travel once in the run response (the text snapshot is
 * re-sent with every request) and the client uploads them to PocketBase.
 */
function collectOutputs() {
    const files = {};
    const artifacts = [];
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let textTotal = 0;
    let artifactTotal = 0;
    const walk = (directory) => {
        let entries;
        try {
            entries = readdirSync(directory, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(directory, entry.name);
            if (entry.isSymbolicLink() || !insideRoot(full)) continue;
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!entry.isFile()) continue;
            let raw;
            try {
                // Read at most the artifact cap; larger text files are
                // truncated later and larger binaries are skipped.
                const size = statSync(full).size;
                const buffer = Buffer.alloc(
                    Math.min(size, MAX_ARTIFACT_BYTES + 1),
                );
                const fd = openSync(full, "r");
                let read = 0;
                try {
                    while (read < buffer.length) {
                        const count = readSync(
                            fd,
                            buffer,
                            read,
                            buffer.length - read,
                            read,
                        );
                        if (count === 0) break;
                        read += count;
                    }
                } finally {
                    closeSync(fd);
                }
                raw =
                    read === buffer.length ? buffer : buffer.subarray(0, read);
            } catch {
                continue;
            }
            const mime = sniffImageMime(raw);
            if (mime) {
                if (raw.length > MAX_ARTIFACT_BYTES) continue;
                if (artifacts.length >= MAX_ARTIFACTS) continue;
                if (artifactTotal + raw.length > MAX_ARTIFACT_TOTAL_BYTES) {
                    continue;
                }
                artifactTotal += raw.length;
                artifacts.push({
                    path: path.relative(ROOT, full),
                    mime,
                    bytes: raw.length,
                    data: raw.toString("base64"),
                });
                continue;
            }
            if (Object.keys(files).length >= MAX_FILES) continue;
            let content;
            try {
                content = decoder.decode(raw);
            } catch {
                continue;
            }
            content = content.slice(0, MAX_FILE_CHARS);
            textTotal += content.length;
            if (textTotal > MAX_TOTAL_CHARS) continue;
            files[path.relative(ROOT, full)] = content;
        }
    };
    walk(ROOT);
    return { files, artifacts };
}

function collectFiles() {
    return collectOutputs().files;
}

function requirePath(value) {
    const clean = normalizePath(value);
    if (!clean) throw new Error("文件路径不合法");
    const full = path.join(ROOT, clean);
    if (!insideRoot(full)) throw new Error("文件路径不合法");
    return full;
}

const sandbox = {
    files: {},
    read(value) {
        const full = requirePath(value);
        try {
            return readFileSync(full, "utf8").slice(0, MAX_FILE_CHARS);
        } catch {
            return null;
        }
    },
    write(value, content) {
        const full = requirePath(value);
        const text = typeof content === "string" ? content : String(content);
        if (text.length > MAX_FILE_CHARS) {
            throw new Error(`单个文件最多 ${MAX_FILE_CHARS} 个字符`);
        }
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, text, "utf8");
        return text.length;
    },
    list() {
        return Object.keys(collectFiles()).sort();
    },
    remove(value) {
        const full = requirePath(value);
        try {
            unlinkSync(full);
            return true;
        } catch {
            return false;
        }
    },
    async fetch(url, timeout = 15) {
        if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
            throw new Error("只支持 http/https");
        }
        const seconds = Math.min(Math.max(Number(timeout) || 15, 1), 20);
        const response = await fetch(url, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(seconds * 1000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.text()).slice(0, 2 * MAX_FILE_CHARS);
    },
    async download(url, value, timeout = 15) {
        if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
            throw new Error("只支持 http/https");
        }
        const clean = normalizePath(value);
        if (!clean) throw new Error("文件路径不合法");
        const full = requirePath(clean);
        const seconds = Math.min(Math.max(Number(timeout) || 15, 1), 20);
        const response = await fetch(url, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(seconds * 1000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = Buffer.from(await response.arrayBuffer());
        if (data.length > MAX_ARTIFACT_BYTES) {
            throw new Error(`文件太大（最多 ${MAX_ARTIFACT_BYTES} 字节）`);
        }
        if (data.length === 0) throw new Error("下载到的内容是空的");
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, data);
        return { path: clean, size: data.length };
    },
};

function boundedConsole(logs) {
    let size = 0;
    const push = (kind, args) => {
        if (size >= MAX_LOG_CHARS) return;
        const line = args
            .map((value) =>
                typeof value === "string"
                    ? value
                    : util.inspect(value, { depth: 3, breakLength: 120 }),
            )
            .join(" ");
        const text = kind === "log" ? line : `[${kind}] ${line}`;
        const remaining = MAX_LOG_CHARS - size;
        if (remaining <= 0) return;
        const piece = text.slice(0, remaining);
        size += piece.length;
        logs.push(piece);
    };
    return {
        log: (...args) => push("log", args),
        info: (...args) => push("log", args),
        debug: (...args) => push("log", args),
        warn: (...args) => push("warn", args),
        error: (...args) => push("error", args),
    };
}

function serializeResult(value) {
    if (value === undefined) return null;
    try {
        const text = JSON.stringify(value, (_, item) =>
            typeof item === "bigint" ? `${item}n` : item,
        );
        if (text === undefined) return null;
        if (text.length > MAX_RESULT_CHARS) {
            return `${text.slice(0, MAX_RESULT_CHARS)}…`;
        }
        return JSON.parse(text);
    } catch {
        return util
            .inspect(value, { depth: 3, breakLength: 120 })
            .slice(0, MAX_RESULT_CHARS);
    }
}

async function run(request) {
    const started = Date.now();
    const files = sanitizeFiles(request.files);
    const op = request.op;
    const response = {
        ok: false,
        result: null,
        logs: [],
        files,
        artifacts: [],
        durationMs: 0,
    };

    try {
        if (op === "list") {
            response.ok = true;
            response.result = Object.keys(files).sort();
        } else if (op === "read") {
            const target = normalizePath(request.path);
            if (!target) throw new Error("文件路径不合法");
            response.ok = true;
            response.result = files[target] ?? null;
        } else if (op === "write") {
            const target = normalizePath(request.path);
            if (!target) throw new Error("文件路径不合法");
            if (typeof request.content !== "string") {
                throw new Error("文件内容必须是字符串");
            }
            if (request.content.length > MAX_FILE_CHARS) {
                throw new Error(`单个文件最多 ${MAX_FILE_CHARS} 个字符`);
            }
            const next = { ...files, [target]: request.content };
            if (
                Object.keys(next).length > MAX_FILES ||
                Object.values(next).reduce(
                    (sum, value) => sum + value.length,
                    0,
                ) > MAX_TOTAL_CHARS
            ) {
                throw new Error("沙箱文件总量超出上限");
            }
            response.ok = true;
            response.result = { path: target, size: request.content.length };
            response.files = next;
        } else if (op === "run") {
            const code = request.code;
            if (typeof code !== "string" || code.trim() === "") {
                throw new Error("缺少要运行的代码");
            }
            materialize(files);
            process.chdir(ROOT);
            const logs = [];
            const consoleShim = boundedConsole(logs);
            const AsyncFunction = Object.getPrototypeOf(
                async function () {},
            ).constructor;
            const fn = new AsyncFunction("sandbox", "console", code);
            let error = null;
            let value;
            try {
                value = await fn(sandbox, consoleShim);
            } catch (caught) {
                error =
                    caught instanceof Error
                        ? caught.message || caught.name
                        : String(caught);
                error = error.slice(0, 500);
            }
            if (value === undefined && Object.hasOwn(globalThis, "result")) {
                value = globalThis.result;
            }
            const collected = collectOutputs();
            response.ok = error === null;
            response.result = serializeResult(value);
            response.logs = logs.slice(0, MAX_LOG_LINES);
            response.files = collected.files;
            response.artifacts = collected.artifacts;
            if (error) response.error = error;
        } else {
            throw new Error("未知操作");
        }
    } catch (caught) {
        response.error = (
            caught instanceof Error ? caught.message : String(caught)
        ).slice(0, 500);
    } finally {
        rmSync(ROOT, { recursive: true, force: true });
    }

    response.durationMs = Date.now() - started;
    return response;
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let request;
try {
    request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch {
    process.stdout.write(
        JSON.stringify({
            ok: false,
            result: null,
            logs: [],
            files: {},
            artifacts: [],
            error: "请求不是合法的 JSON",
            durationMs: 0,
        }),
    );
    process.exit(0);
}
const response = await run(request);
process.stdout.write(JSON.stringify(response));
