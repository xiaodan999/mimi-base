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

/**
 * Binary outputs (images) the sandbox sends back alongside the text snapshot.
 * The container is recreated for every request, so a binary that is not
 * returned with the run that produced it is gone; the client uploads these
 * to PocketBase immediately (see `chat_artifacts`).
 *
 * Keep in sync with `pocketbase/sandbox/runner.py` / `runner.mjs`.
 */
export const MAX_ARTIFACTS = 3;
export const MAX_ARTIFACT_BYTES = 1_500_000;
export const MAX_ARTIFACT_TOTAL_BYTES = 3_000_000;
export const ARTIFACT_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
] as const;

export type ArtifactMime = (typeof ARTIFACT_MIME_TYPES)[number];

export type SandboxFiles = Record<string, string>;

export type SandboxArtifact = {
    path: string;
    mime: ArtifactMime;
    bytes: number;
    /** Standard base64 (no `data:` prefix), ASCII only. */
    data: string;
};

export type SandboxOp = "run" | "read" | "write" | "list";

export type SandboxLanguage = "python" | "javascript";

export type SandboxRequest = {
    op: SandboxOp;
    /** Defaults to Python when omitted (legacy requests). */
    language?: SandboxLanguage;
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
    /** Images produced by this run; `data` is base64. */
    artifacts: SandboxArtifact[];
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

export function normalizeArtifactMime(value: unknown): ArtifactMime | null {
    return typeof value === "string" &&
        (ARTIFACT_MIME_TYPES as readonly string[]).includes(value)
        ? (value as ArtifactMime)
        : null;
}

/** Decoded byte length of standard base64, or null when it is malformed. */
function base64Bytes(value: string): number | null {
    if (value.length === 0 || value.length % 4 !== 0) return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
    const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
    return (value.length / 4) * 3 - padding;
}

/**
 * Bound and validate the artifacts block the runner returns. The reported
 * size is ignored: it is derived from the base64 payload so a lying runner
 * cannot make the client accept more bytes than the cap.
 */
export function sanitizeArtifacts(input: unknown): SandboxArtifact[] {
    if (!Array.isArray(input)) return [];
    const artifacts: SandboxArtifact[] = [];
    const seen = new Set<string>();
    let total = 0;
    for (const raw of input) {
        if (artifacts.length >= MAX_ARTIFACTS) break;
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
            continue;
        }
        const record = raw as Record<string, unknown>;
        const path = normalizeSandboxPath(record.path);
        const mime = normalizeArtifactMime(record.mime);
        const data = typeof record.data === "string" ? record.data : "";
        if (!path || !mime || data === "" || seen.has(path)) continue;
        const bytes = base64Bytes(data);
        if (
            bytes === null ||
            bytes === 0 ||
            bytes > MAX_ARTIFACT_BYTES ||
            total + bytes > MAX_ARTIFACT_TOTAL_BYTES
        ) {
            continue;
        }
        seen.add(path);
        total += bytes;
        artifacts.push({ path, mime, bytes, data });
    }
    return artifacts;
}

/** Unknown values are rejected by the executor; missing means Python. */
export function normalizeSandboxLanguage(
    value: unknown,
): SandboxLanguage | null {
    if (value === undefined || value === null || value === "") return "python";
    if (value === "python" || value === "javascript") return value;
    return null;
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
