import type { SandboxFiles } from "./types";

/**
 * Protocol shared by the sandbox worker and the main thread.
 *
 * The worker is a separate JavaScript realm: no DOM, no localStorage /
 * IndexedDB access, and the network primitives are replaced with throwing
 * stubs. Each call gets the conversation's file snapshot and returns the new
 * snapshot, so state is explicit and a runaway script can be terminated.
 *
 * This is an isolation boundary for the *app* (model code cannot touch the
 * page or its storage); it is not a security boundary against the machine.
 */

export const MAX_FILES = 40;
export const MAX_FILE_CHARS = 100_000;
export const MAX_TOTAL_CHARS = 400_000;
export const MAX_CODE_CHARS = 60_000;
export const MAX_LOG_LINES = 100;
export const MAX_OUTPUT_CHARS = 20_000;

export type SandboxOp = "run" | "read" | "write" | "list";

export type SandboxRequest = {
    id: number;
    op: SandboxOp;
    code?: string;
    path?: string;
    content?: string;
    files?: unknown;
};

export type SandboxResponse = {
    id: number;
    ok: boolean;
    result?: unknown;
    logs: string[];
    files: SandboxFiles;
    error?: string;
    durationMs: number;
};

function charLength(value: string): number {
    return Array.from(value).length;
}

function totalChars(files: SandboxFiles): number {
    let total = 0;
    for (const content of Object.values(files)) {
        total += charLength(content);
    }
    return total;
}

/**
 * Paths are relative to the conversation sandbox. Absolute paths, `..`
 * traversal, backslashes and control characters are rejected so a file can
 * never escape the snapshot.
 */
export function normalizeSandboxPath(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const path = value.trim().replace(/^\.\//, "");
    if (path === "" || path.length > 200) return null;
    if (path.startsWith("/") || path.includes("\\")) return null;
    for (const char of path) {
        const code = char.charCodeAt(0);
        if (code < 32 || code === 127) return null;
    }
    const parts = path.split("/");
    if (parts.some((part) => part === "" || part === "." || part === "..")) {
        return null;
    }
    return path;
}

/** Keep a bounded, path-validated copy of a file snapshot. */
export function sanitizeFiles(input: unknown): SandboxFiles {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return {};
    }
    const files: SandboxFiles = {};
    let total = 0;
    for (const [rawPath, rawContent] of Object.entries(input)) {
        if (Object.keys(files).length >= MAX_FILES) break;
        const path = normalizeSandboxPath(rawPath);
        if (!path || typeof rawContent !== "string") continue;
        const content = rawContent.slice(0, MAX_FILE_CHARS);
        total += charLength(content);
        if (total > MAX_TOTAL_CHARS) break;
        files[path] = content;
    }
    return files;
}

export function describeError(error: unknown): string {
    if (error instanceof Error) {
        return error.message.slice(0, 500) || error.name;
    }
    return String(error).slice(0, 500);
}

/** `console.log` arguments -> one readable line, JSON for objects. */
export function formatConsoleArgs(args: readonly unknown[]): string {
    return args
        .map((value) => {
            if (typeof value === "string") return value;
            if (typeof value === "number" || typeof value === "boolean") {
                return String(value);
            }
            if (value === null) return "null";
            if (value === undefined) return "undefined";
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        })
        .join(" ")
        .slice(0, 4_000);
}

/** JSON-safe, depth-bounded copy of a script's return value. */
export function safeSerialize(value: unknown, depth = 0): unknown {
    if (depth > 6) return "[层级过深]";
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
        return value.length > MAX_OUTPUT_CHARS
            ? `${value.slice(0, MAX_OUTPUT_CHARS)}…`
            : value;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : String(value);
    }
    if (typeof value === "boolean") return value;
    if (typeof value === "bigint") return `${value}n`;
    if (typeof value === "function") return "[function]";
    if (Array.isArray(value)) {
        return value
            .slice(0, 200)
            .map((item) => safeSerialize(item, depth + 1));
    }
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(record).slice(0, 100)) {
            result[key] = safeSerialize(record[key], depth + 1);
        }
        return result;
    }
    return String(value);
}

/**
 * Dynamic imports and `importScripts` would fetch a URL from inside the
 * worker, bypassing the stubbed network APIs. The worker cannot reach app
 * data anyway, but keep the "no network" promise honest.
 */
export function validateSandboxCode(code: unknown): string | null {
    if (typeof code !== "string" || code.trim() === "") {
        return "缺少要运行的代码";
    }
    if (charLength(code) > MAX_CODE_CHARS) {
        return `代码太长了（最多 ${MAX_CODE_CHARS} 个字符）`;
    }
    if (/\bimport\s*\(|\bimportScripts\b/.test(code)) {
        return "沙箱里不能加载外部脚本";
    }
    return null;
}

type AsyncFunctionCtor = new (
    ...args: string[]
) => (...values: unknown[]) => Promise<unknown>;

function asyncFunctionCtor(): AsyncFunctionCtor {
    return Object.getPrototypeOf(async function () {})
        .constructor as AsyncFunctionCtor;
}

/**
 * Execute one sandbox request. Runs in the worker in production, but is a
 * plain function so tests can exercise the file rules directly.
 */
export async function runSandboxOperation(
    request: SandboxRequest,
): Promise<SandboxResponse> {
    const started = Date.now();
    let files = sanitizeFiles(request.files);
    const logs: string[] = [];
    const base = () => ({
        id: request.id,
        logs: logs.slice(-MAX_LOG_LINES),
        files,
        durationMs: Date.now() - started,
    });

    if (request.op === "list") {
        return { ...base(), ok: true, result: Object.keys(files).sort() };
    }

    if (request.op === "read") {
        const path = normalizeSandboxPath(request.path);
        if (!path) {
            return { ...base(), ok: false, error: "文件路径不合法" };
        }
        return {
            ...base(),
            ok: true,
            result: Object.prototype.hasOwnProperty.call(files, path)
                ? files[path]
                : null,
        };
    }

    if (request.op === "write") {
        const path = normalizeSandboxPath(request.path);
        if (!path) {
            return { ...base(), ok: false, error: "文件路径不合法" };
        }
        if (typeof request.content !== "string") {
            return { ...base(), ok: false, error: "文件内容必须是字符串" };
        }
        if (charLength(request.content) > MAX_FILE_CHARS) {
            return {
                ...base(),
                ok: false,
                error: `单个文件最多 ${MAX_FILE_CHARS} 个字符`,
            };
        }
        const next = { ...files, [path]: request.content };
        if (
            Object.keys(next).length > MAX_FILES ||
            totalChars(next) > MAX_TOTAL_CHARS
        ) {
            return { ...base(), ok: false, error: "沙箱文件总量超出上限" };
        }
        files = next;
        return {
            ...base(),
            ok: true,
            result: { path, size: request.content.length },
        };
    }

    // op === "run"
    const invalid = validateSandboxCode(request.code);
    if (invalid) return { ...base(), ok: false, error: invalid };
    const code = request.code as string;

    const pushLog = (kind: string, args: readonly unknown[]) => {
        if (logs.length >= MAX_LOG_LINES) return;
        const line = formatConsoleArgs(args);
        logs.push(kind === "log" ? line : `[${kind}] ${line}`);
    };
    const consoleShim = {
        log: (...args: unknown[]) => pushLog("log", args),
        info: (...args: unknown[]) => pushLog("log", args),
        debug: (...args: unknown[]) => pushLog("log", args),
        warn: (...args: unknown[]) => pushLog("warn", args),
        error: (...args: unknown[]) => pushLog("error", args),
    };

    const sandbox = {
        files,
        read(path: unknown) {
            const clean = normalizeSandboxPath(path);
            return clean && Object.prototype.hasOwnProperty.call(files, clean)
                ? files[clean]
                : null;
        },
        write(path: unknown, content: unknown) {
            const clean = normalizeSandboxPath(path);
            if (!clean) throw new Error("文件路径不合法");
            if (typeof content !== "string") {
                throw new Error("文件内容必须是字符串");
            }
            if (charLength(content) > MAX_FILE_CHARS) {
                throw new Error(`单个文件最多 ${MAX_FILE_CHARS} 个字符`);
            }
            const next = { ...files, [clean]: content };
            if (
                Object.keys(next).length > MAX_FILES ||
                totalChars(next) > MAX_TOTAL_CHARS
            ) {
                throw new Error("沙箱文件总量超出上限");
            }
            files = next;
            return content.length;
        },
        list() {
            return Object.keys(files).sort();
        },
        remove(path: unknown) {
            const clean = normalizeSandboxPath(path);
            if (!clean) return false;
            if (!Object.prototype.hasOwnProperty.call(files, clean)) {
                return false;
            }
            const next = { ...files };
            delete next[clean];
            files = next;
            return true;
        },
    };

    try {
        const fn = new (asyncFunctionCtor())("sandbox", "console", code);
        const value = await fn(sandbox, consoleShim);
        files = sanitizeFiles(files);
        return { ...base(), ok: true, result: safeSerialize(value) };
    } catch (error) {
        files = sanitizeFiles(files);
        return { ...base(), ok: false, error: describeError(error) };
    }
}
