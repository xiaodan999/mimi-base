/**
 * Chat attachments live in `chat_attachments` (the original bytes are stored
 * server-side, protected and owner-scoped). The browser never runs pdf.js:
 * it creates the record (`useChatActions().createAttachment`), then asks the
 * relay to read the stored copy. The relay returns the extracted text plus,
 * for vision models, the first pages as JPEG data URLs. A `read_attachment`
 * tool call goes through the same endpoint for more pages or the full text,
 * which is what keeps follow-up questions from being capped by the inline
 * excerpt.
 */

import { MAX_PAGE_IMAGES } from "@/lib/chat-files";

import type { ChatAttachmentPart } from "./types";

export { FILE_ACCEPT, MAX_ATTACHMENTS } from "@/lib/chat-files";

export type ExtractedFile = {
    name: string;
    kind: "text" | "pdf";
    content: string;
    truncated: boolean;
    numPages?: number;
    /** Server-rendered page images (JPEG data URLs). */
    pageImages?: string[];
    /** 1-based page numbers of `pageImages` (pages-mode reads only). */
    pages?: number[];
};

/** The `chat_attachments` row the client needs to build a part and file URL. */
export type AttachmentRecord = {
    id: string;
    collectionId: string;
    file: string;
    name: string;
    mime: string;
    size: number;
    kind: "pdf" | "text";
};

/** A composer chip: the stored record plus its (possibly pending) extraction. */
export type PendingAttachment = {
    part: ChatAttachmentPart;
    reading: boolean;
};

/** Ask the relay to read a stored attachment (text, or pages on a vision model). */
export async function extractAttachment(
    attachmentId: string,
    options: { pageImageLimit?: number; pages?: string } = {},
): Promise<ExtractedFile> {
    // Dynamic import keeps `lib/pb` (and its env check) out of unit tests.
    const { aiUrl, chatHeaders, readChatError } = await import("./api");
    const pageImageLimit = Math.max(
        0,
        Math.min(MAX_PAGE_IMAGES, Math.floor(options.pageImageLimit ?? 0)),
    );
    let res: Response;
    try {
        res = await fetch(aiUrl("/files"), {
            method: "POST",
            headers: { ...chatHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({
                attachmentId,
                ...(pageImageLimit > 0 ? { pageImageLimit } : {}),
                ...(options.pages ? { pages: options.pages } : {}),
            }),
        });
    } catch {
        throw new Error("附件读取失败，检查网络后再试");
    }
    if (!res.ok) throw await readChatError(res);

    let payload: unknown;
    try {
        payload = await res.json();
    } catch {
        throw new Error("文件读取失败，再试一次");
    }
    return parseUploadedFileResponse(payload, "");
}

/** Validate the relay's JSON before it becomes message content. */
export function parseUploadedFileResponse(
    payload: unknown,
    fallbackName: string,
): ExtractedFile {
    if (typeof payload !== "object" || payload === null) {
        throw new Error("文件读取失败，再试一次");
    }
    const value = payload as Record<string, unknown>;
    if (
        (value.kind !== "text" && value.kind !== "pdf") ||
        typeof value.content !== "string"
    ) {
        throw new Error("文件读取失败，再试一次");
    }
    const images = Array.isArray(value.images)
        ? value.images
              .filter(
                  (image): image is string =>
                      typeof image === "string" &&
                      image.startsWith("data:image/jpeg;base64,"),
              )
              .slice(0, MAX_PAGE_IMAGES)
        : [];
    const numPages =
        typeof value.numPages === "number" &&
        Number.isFinite(value.numPages) &&
        value.numPages > 0
            ? Math.round(value.numPages)
            : undefined;
    // Pages pair with the rendered images (pages[i] is the page of images[i]).
    const pages = Array.isArray(value.pages)
        ? value.pages
              .filter(
                  (page): page is number =>
                      typeof page === "number" && Number.isInteger(page),
              )
              .slice(0, images.length)
        : undefined;
    return {
        name:
            typeof value.name === "string" && value.name !== ""
                ? value.name
                : fallbackName,
        kind: value.kind,
        content: value.content,
        truncated: value.truncated === true,
        ...(numPages !== undefined ? { numPages } : {}),
        ...(images.length > 0 ? { pageImages: images } : {}),
        ...(pages !== undefined && pages.length > 0 ? { pages } : {}),
    };
}

/** The message part referencing the stored record, pre-extraction. */
export function attachmentPartFromRecord(
    record: AttachmentRecord,
): ChatAttachmentPart {
    return {
        type: "attachment",
        attachmentId: record.id,
        collectionId: record.collectionId,
        file: record.file,
        name: record.name,
        mime: record.mime,
        size: record.size,
        kind: record.kind,
        truncated: false,
        extracted: "",
        pageImages: [],
    };
}

/** Fold an extraction result into a part (mutates a copy, for the composer). */
export function withExtracted(
    part: ChatAttachmentPart,
    file: ExtractedFile,
): ChatAttachmentPart {
    return {
        ...part,
        name: part.name || file.name,
        truncated: file.truncated,
        ...(file.numPages !== undefined ? { pageCount: file.numPages } : {}),
        extracted: file.content,
        pageImages: file.pageImages ?? [],
    };
}
