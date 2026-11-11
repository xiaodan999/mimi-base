/**
 * Attachment metadata shared by the feedback form, its list and the data
 * layer. Attachments are uploaded to GitHub by the Bun API *before* the
 * report row is created; the row's `attachments` JSONField stores only this
 * shape. Keep the parser pure (no PocketBase / browser imports) so it can be
 * unit-tested and reused by the issue-body renderer's client mirror.
 */

import { MAX_FEEDBACK_ATTACHMENTS } from "./validation";

export type FeedbackAttachment = {
    /** Original browser file name, shown in the UI and the issue body. */
    name: string;
    /** Public GitHub release/destination URL returned by the Bun API. */
    url: string;
    /** Bytes; omitted when the server did not report one. */
    size?: number;
    /** MIME type as sent by the browser; `image/*` renders inline. */
    type?: string;
};

/** Parentheses/brackets would terminate a Markdown link early. */
const HTTPS_URL_RE = /^https:\/\/[^\s<>"'`()[\]{}]+$/i;

function positiveInt(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : undefined;
}

function clean(value: unknown, max: number): string {
    if (typeof value !== "string") return "";
    return value
        .replace(/\p{Cc}/gu, "")
        .trim()
        .slice(0, max);
}

/**
 * Parse `attachments` from an upload response or a report row. PocketBase's
 * JSONField may return the parsed array or the raw JSON string; both are
 * accepted. Only public https URLs survive (same rule as the server-side
 * issue body), and the list is capped at the shared attachment limit.
 */
export function parseAttachmentList(value: unknown): FeedbackAttachment[] {
    let raw = value;
    if (typeof raw === "string") {
        try {
            raw = JSON.parse(raw) as unknown;
        } catch {
            return [];
        }
    }
    if (!Array.isArray(raw)) return [];
    const attachments: FeedbackAttachment[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const url = clean(record.url, 1000);
        if (!HTTPS_URL_RE.test(url)) continue;
        const name = clean(record.name, 200) || "附件";
        const size = positiveInt(record.size);
        const type = clean(record.type, 100);
        attachments.push({
            name,
            url,
            ...(size === undefined ? {} : { size }),
            ...(type ? { type } : {}),
        });
        if (attachments.length >= MAX_FEEDBACK_ATTACHMENTS) break;
    }
    return attachments;
}

const IMAGE_EXTENSIONS = [
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".heic",
    ".heif",
    ".avif",
    ".bmp",
    ".svg",
];

/** True for image attachments (inline preview / inline issue body). */
export function isImageAttachment(
    attachment: Pick<FeedbackAttachment, "name" | "type">,
): boolean {
    if ((attachment.type ?? "").toLowerCase().startsWith("image/")) {
        return true;
    }
    const name = (attachment.name ?? "").toLowerCase();
    return IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/** 1234 -> "1.2 KB"; used by the list and the issue body mirror. */
export function attachmentSizeLabel(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) {
        return `${kb < 10 ? Math.round(kb * 10) / 10 : Math.round(kb)} KB`;
    }
    return `${Math.round((kb / 1024) * 10) / 10} MB`;
}
