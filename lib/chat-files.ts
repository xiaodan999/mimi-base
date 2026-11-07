/**
 * Chat attachment rules shared by the browser picker and the relay that reads
 * the file (`pocketbase/ai-files.ts`). Keep the allowlist here so the picker
 * and the server cannot drift apart.
 */

export const MAX_ATTACHMENTS = 3;
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_FILE_CHARS = 50_000;
export const MAX_PDF_PAGES = 20;
/** Page images rendered for a scanned PDF (the composer allows 4 images). */
export const MAX_PAGE_IMAGES = 4;

export const FILE_EXTENSIONS = [
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".json",
    ".log",
    ".xml",
    ".yaml",
    ".yml",
    ".html",
    ".css",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".java",
    ".go",
    ".rs",
    ".sql",
    ".sh",
    ".pdf",
];

export const FILE_ACCEPT = FILE_EXTENSIONS.join(",");

function lowerExtension(name: string): string {
    const dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function isPdfFileName(name: string): boolean {
    return lowerExtension(name) === ".pdf";
}

export function isSupportedFileName(name: string): boolean {
    return FILE_EXTENSIONS.includes(lowerExtension(name));
}

/** Strip any path part and control characters before using a client name. */
export function sanitizeFileName(raw: string): string {
    const base = raw.split(/[\\/]/).pop() ?? "";
    const cleaned = Array.from(base)
        .filter((char) => {
            const code = char.codePointAt(0) ?? 0;
            return code >= 0x20 && code !== 0x7f;
        })
        .join("")
        .trim();
    return cleaned.slice(0, 120) || "附件";
}

/** True when the upload size is within the relay's limit. */
export function isAllowedFileSize(bytes: number): boolean {
    return Number.isFinite(bytes) && bytes > 0 && bytes <= MAX_FILE_BYTES;
}
