/**
 * Chat attachments are read by the relay (`POST /ai/files`), not in the
 * browser: pdf.js needs CMaps/standard fonts for Chinese PDFs, and shipping
 * those to a phone made the feature fail exactly where it was used. The
 * server returns the extracted text, or JPEG pages for a scanned PDF, and the
 * client appends that to the message like a normal part.
 */

import { MAX_FILE_BYTES, MAX_PAGE_IMAGES } from "@/lib/chat-files";

export { FILE_ACCEPT, MAX_ATTACHMENTS } from "@/lib/chat-files";

export type ExtractedFile = {
    name: string;
    kind: "text" | "pdf";
    content: string;
    truncated: boolean;
    /** Server-rendered pages of a scanned PDF; sent as image parts. */
    pageImages?: string[];
};

export async function extractFileText(
    file: File,
    options: { pageImageLimit?: number } = {},
): Promise<ExtractedFile> {
    if (file.size === 0) throw new Error("文件是空的");
    if (file.size > MAX_FILE_BYTES) {
        throw new Error(
            `文件太大了（最大 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB）`,
        );
    }

    // Dynamic import keeps `lib/pb` (and its env check) out of unit tests.
    const { aiUrl, chatHeaders, readChatError } = await import("./api");
    const pageImageLimit = Math.max(
        0,
        Math.min(MAX_PAGE_IMAGES, Math.floor(options.pageImageLimit ?? 0)),
    );
    const headers: Record<string, string> = {
        ...chatHeaders(),
        "Content-Type": file.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(file.name),
    };
    if (pageImageLimit > 0) {
        headers["x-file-images"] = String(pageImageLimit);
    }

    let res: Response;
    try {
        res = await fetch(aiUrl("/files"), {
            method: "POST",
            headers,
            body: file,
        });
    } catch {
        throw new Error("文件上传失败，检查网络后再试");
    }
    if (!res.ok) throw await readChatError(res);

    let payload: unknown;
    try {
        payload = await res.json();
    } catch {
        throw new Error("文件读取失败，再试一次");
    }
    return parseUploadedFileResponse(payload, file.name);
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
    return {
        name:
            typeof value.name === "string" && value.name !== ""
                ? value.name
                : fallbackName,
        kind: value.kind,
        content: value.content,
        truncated: value.truncated === true,
        ...(images.length > 0 ? { pageImages: images } : {}),
    };
}

/** The fenced block appended to the message text for one attachment. */
export function attachmentToMessageText(file: ExtractedFile): string {
    if (file.pageImages && file.pageImages.length > 0) {
        return `[附件 ${file.name}（扫描件，已转成 ${file.pageImages.length} 页图片发送）]`;
    }
    const header = `[附件 ${file.name}${file.truncated ? "（内容过长，已截断）" : ""}]`;
    return `${header}\n\`\`\`\n${file.content}\n\`\`\``;
}
