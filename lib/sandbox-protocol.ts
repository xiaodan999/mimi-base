/**
 * Protocol shared by the chat client and the server-side sandbox.
 *
 * The browser only validates and sanitizes what it sends; the real isolation
 * happens on the server (`pocketbase/sandbox/`), inside a systemd unit with a
 * private network namespace. Keep these limits in sync with
 * `pocketbase/sandbox/runner.py`.
 */

export const MAX_FILES = 40;
export const MAX_FILE_CHARS = 100_000;
export const MAX_TOTAL_CHARS = 400_000;
export const MAX_CODE_CHARS = 60_000;
export const MAX_LOG_LINES = 100;
export const MAX_OUTPUT_CHARS = 20_000;
/** Hard limit enforced by the systemd unit and the executor. */
export const SANDBOX_TIMEOUT_MS = 20_000;

export type SandboxFiles = Record<string, string>;

export type SandboxOp = "run" | "read" | "write" | "list";

export type SandboxRequest = {
    op: SandboxOp;
    code?: string;
    path?: string;
    content?: string;
    /** Snapshot from the conversation, path -> text. */
    files?: unknown;
};

export type SandboxResponse = {
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

/**
 * Python code is executed inside the OS sandbox; imports are allowed, the
 * network is filtered there. This only enforces the request-size limit.
 */
export function validateSandboxCode(code: unknown): string | null {
    if (typeof code !== "string" || code.trim() === "") {
        return "缺少要运行的代码";
    }
    if (charLength(code) > MAX_CODE_CHARS) {
        return `代码太长了（最多 ${MAX_CODE_CHARS} 个字符）`;
    }
    return null;
}
