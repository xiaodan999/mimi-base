/**
 * Chat attachment rules shared by the browser picker and the relay that reads
 * the file (`pocketbase/ai-files.ts`). Keep the allowlist here so the picker
 * and the server cannot drift apart.
 */

export const MAX_ATTACHMENTS = 3;
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_FILE_CHARS = 50_000;
export const MAX_PDF_PAGES = 20;
/**
 * Page images rendered per `/ai/files` request: the composer's inline budget
 * for a PDF (its own budget, separate from the 4-photo composer limit) and
 * the most one `read_attachment` call renders. A page costs roughly 1-2.5k
 * vision tokens; ten covers typical contracts and receipts inline, and the
 * tool can be called repeatedly for the rest.
 */
export const MAX_PAGE_IMAGES = 10;
/** Highest page number the page-image renderer will address in one PDF. */
export const MAX_PDF_RENDER_PAGE = 200;

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

/**
 * Parse a page spec like "3" or "2-5" into clamped, unique, ascending 1-based
 * page numbers. Pages beyond `maxPage` (or the render cap) are dropped; the
 * result is capped at MAX_PAGE_IMAGES so one tool call cannot flood the
 * request with images. Empty result means the spec named nothing readable.
 */
export function parsePageSpec(spec: string, maxPage: number): number[] {
    const ceiling = Math.max(0, Math.min(maxPage, MAX_PDF_RENDER_PAGE));
    const pages = new Set<number>();
    for (const chunk of spec.split(/[,，]/)) {
        const range = chunk.trim().match(/^(\d+)\s*[-—~]\s*(\d+)$/);
        if (range) {
            const from = Number(range[1]);
            const to = Number(range[2]);
            const [start, end] = from <= to ? [from, to] : [to, from];
            for (let page = start; page <= end; page++) pages.add(page);
            continue;
        }
        const single = chunk.trim().match(/^\d+$/);
        if (single) pages.add(Number(single[0]));
    }
    return [...pages]
        .filter((page) => page >= 1 && page <= ceiling)
        .sort((a, b) => a - b)
        .slice(0, MAX_PAGE_IMAGES);
}
