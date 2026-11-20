/**
 * Chat attachment rules shared by the browser picker and the on-device reader
 * (`app/chat/attachments.ts`). Keep the allowlist here so the picker, the
 * reader and the `read_attachment` tool cannot drift apart.
 */

export const MAX_ATTACHMENTS = 3;
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_FILE_CHARS = 50_000;
/**
 * Page images rendered per composer message: the inline budget for PDFs (its
 * own budget, separate from the 4-photo composer limit) and the most one
 * `read_attachment` call renders. A page costs roughly 1-2.5k vision tokens;
 * ten covers typical contracts and receipts inline, and the tool can be
 * called repeatedly for the rest.
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

/**
 * PocketBase record id shape. `read_attachment` args must carry one — a file
 * name there means the model guessed instead of copying the 附件标注, and the
 * read would fail. Checked before the client renders or fetches anything.
 */
export function isRecordId(value: string): boolean {
    return /^[a-z0-9]+$/.test(value);
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

/** True when the upload size is within the attachment limit. */
export function isAllowedFileSize(bytes: number): boolean {
    return Number.isFinite(bytes) && bytes > 0 && bytes <= MAX_FILE_BYTES;
}

/** NUL bytes are a cheap, reliable binary signal for the text extensions. */
export function isBinaryData(data: Uint8Array): boolean {
    return data.subarray(0, 4096).includes(0);
}

/**
 * Parse a page spec like "3" or "2-5" into clamped, unique, ascending 1-based
 * page numbers. Pages beyond `maxPage` (or the render cap) are dropped; the
 * result is capped at MAX_PAGE_IMAGES so one tool call cannot flood the
 * request with images. Empty result means the spec named nothing readable.
 */
export function parsePageSpec(spec: string, maxPage: number): number[] {
    const ceiling = Math.max(0, Math.min(maxPage, MAX_PDF_RENDER_PAGE));
    if (ceiling < 1) return [];

    // A crafted spec can carry hundreds of digits. Values outside the safe
    // integer range are treated as infinity so the caller's range still
    // clamps to the document instead of overflowing into an endless loop.
    const parseBound = (digits: string): number => {
        if (digits.length > 15) return Number.POSITIVE_INFINITY;
        const value = Number(digits);
        return Number.isSafeInteger(value) ? value : Number.POSITIVE_INFINITY;
    };

    const pages = new Set<number>();
    for (const chunk of spec.split(/[,，]/)) {
        const range = chunk.trim().match(/^(\d+)\s*[-—~]\s*(\d+)$/);
        if (range) {
            const from = parseBound(range[1]);
            const to = parseBound(range[2]);
            const low = Math.min(from, to);
            const high = Math.max(from, to);
            if (high < 1 || low > ceiling) continue;
            const start = Math.max(1, low);
            const end = Math.min(ceiling, high);
            for (let page = start; page <= end; page++) pages.add(page);
            continue;
        }
        const single = chunk.trim().match(/^\d+$/);
        if (!single) continue;
        const page = parseBound(single[0]);
        if (page >= 1 && page <= ceiling) pages.add(page);
    }
    return [...pages].sort((a, b) => a - b).slice(0, MAX_PAGE_IMAGES);
}
