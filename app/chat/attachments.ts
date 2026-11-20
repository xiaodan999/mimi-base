/**
 * Chat attachments live in `chat_attachments` (the original bytes are stored
 * server-side, protected and owner-scoped). The browser reads the picked
 * `File` itself: PDFs are rasterized with the lazy pdf.js chunk (`./pdf`) and
 * text files are decoded locally. The resulting text/pages ride inside the
 * message part; the stored bytes remain so `read_attachment` can render
 * pages that were not sent inline.
 */

import {
    isAllowedFileSize,
    isBinaryData,
    isPdfFileName,
    isSupportedFileName,
    MAX_FILE_BYTES,
    MAX_FILE_CHARS,
    MAX_PAGE_IMAGES,
} from "@/lib/chat-files";

import { readPdfAttachment } from "./pdf";
import type { ChatAttachmentPart, ChatPart } from "./types";

export { FILE_ACCEPT, MAX_ATTACHMENTS } from "@/lib/chat-files";

/** What reading one picked file produces for the message part. */
export type FileReadResult = {
    /** Decoded text; empty for PDFs. */
    text: string;
    truncated: boolean;
    /** PDF page count, when the file was a PDF. */
    pageCount?: number;
    /** Inline page images (JPEG data URLs). */
    pageImages: string[];
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

/** A composer chip: the stored record plus its (possibly pending) read. */
export type PendingAttachment = {
    part: ChatAttachmentPart;
    reading: boolean;
};

type PdfReader = (
    data: Uint8Array,
    pageImageLimit: number,
) => Promise<{ numPages: number; pageImages: string[] }>;

/**
 * Read a picked file locally. `renderPdf` is injectable so unit tests can
 * exercise the text path and the page budget without pdf.js or a DOM.
 */
export async function readAttachmentFile(
    file: File,
    options: { pageImageLimit?: number; renderPdf?: PdfReader } = {},
): Promise<FileReadResult> {
    if (!isSupportedFileName(file.name)) {
        throw new Error("不支持这种文件类型");
    }
    if (!isAllowedFileSize(file.size)) {
        if (file.size === 0) throw new Error("文件是空的");
        throw new Error(
            `文件太大了（最大 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB）`,
        );
    }

    if (isPdfFileName(file.name)) {
        const requested = Number.isFinite(options.pageImageLimit)
            ? Math.floor(options.pageImageLimit ?? 0)
            : 0;
        const pageImageLimit = Math.max(
            0,
            Math.min(MAX_PAGE_IMAGES, requested),
        );
        const read = options.renderPdf ?? readPdfAttachment;
        const data = new Uint8Array(await file.arrayBuffer());
        const { numPages, pageImages } = await read(data, pageImageLimit);
        return {
            text: "",
            truncated: false,
            pageCount: numPages,
            pageImages,
        };
    }

    // Only inspect the head for the binary signal; decoding the whole file as
    // text would produce replacement characters for a binary file.
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    if (isBinaryData(head)) throw new Error("这个文件看起来不是文本");
    const text = await file.text();
    if (text.trim() === "") throw new Error("这个文件是空的");
    return {
        text: text.slice(0, MAX_FILE_CHARS),
        truncated: text.length > MAX_FILE_CHARS,
        pageImages: [],
    };
}

/** The message part referencing the stored record, pre-read. */
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

/** Fold a local read into a part (mutates a copy, for the composer). */
export function withFileRead(
    part: ChatAttachmentPart,
    file: FileReadResult,
): ChatAttachmentPart {
    return {
        ...part,
        truncated: file.truncated,
        ...(file.pageCount !== undefined ? { pageCount: file.pageCount } : {}),
        extracted: file.text,
        pageImages: file.pageImages,
    };
}

/**
 * The newest known part for one attachment. `read_attachment mode=text` serves
 * text attachments from the persisted part instead of re-reading the file.
 */
export function findAttachmentPart(
    messages: readonly { parts: readonly ChatPart[] }[],
    attachmentId: string,
): ChatAttachmentPart | null {
    for (const message of messages) {
        for (const part of message.parts) {
            if (
                part.type === "attachment" &&
                part.attachmentId === attachmentId
            ) {
                return part;
            }
        }
    }
    return null;
}
