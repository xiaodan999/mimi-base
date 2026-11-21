import type { SandboxFiles } from "@/app/chat/types";
import { isRecordId, MAX_PAGE_IMAGES } from "@/lib/chat-files";

import type { ToolHooks } from "../tool-inputs";
import type { ToolOutcome } from "./outcome";

export async function readAttachmentTool(
    args: Record<string, unknown>,
    files: SandboxFiles,
    hooks: ToolHooks,
): Promise<ToolOutcome> {
    const attachmentId =
        typeof args.attachmentId === "string" ? args.attachmentId.trim() : "";
    const mode = args.mode === "pages" ? "pages" : "text";
    const pages = typeof args.pages === "string" ? args.pages : "";
    if (attachmentId === "") {
        return {
            result: { ok: false, error: "缺少附件的 attachmentId" },
            files,
            isError: true,
        };
    }
    // A file name here means the model guessed instead of copying the
    // 附件标注. Fail fast with a corrective message so the next round
    // retries with the id.
    if (!isRecordId(attachmentId)) {
        return {
            result: {
                ok: false,
                error: "attachmentId 不是文件名：请复制消息里附件标注中的记录 id（形如 x7k2m9q4p1n8r3s）再调用",
            },
            files,
            isError: true,
        };
    }
    if (mode === "pages" && pages.trim() === "") {
        return {
            result: { ok: false, error: "mode=pages 时要给出页码" },
            files,
            isError: true,
        };
    }
    // Rendered pages reach the provider as image parts; a text-only
    // model would get the whole request rejected by the relay.
    if (mode === "pages" && hooks.visionEnabled !== true) {
        return {
            result: {
                ok: false,
                error: "当前模型不支持图片，用 mode=text 读取原文，或换一个支持视觉的模型",
            },
            files,
            isError: true,
        };
    }
    try {
        if (mode === "pages") {
            const readPages = hooks.readAttachmentPages;
            if (!readPages) {
                return {
                    result: {
                        ok: false,
                        attachmentId,
                        error: "附件页面读取不可用",
                    },
                    files,
                    isError: true,
                };
            }
            // The hook renders locally and returns data URLs; the model's
            // result stays page numbers only, images ride separately.
            const data = await readPages(attachmentId, pages);
            const resultImages = data.images
                .filter(
                    (image): image is string =>
                        typeof image === "string" &&
                        image.startsWith("data:image/jpeg;base64,"),
                )
                .slice(0, MAX_PAGE_IMAGES);
            return {
                result: {
                    ok: true,
                    attachmentId,
                    name: data.name,
                    pages: data.pages,
                    numPages: data.numPages,
                },
                files,
                isError: false,
                ...(resultImages.length > 0 ? { resultImages } : {}),
            };
        }
        const readText = hooks.readAttachmentText;
        if (!readText) {
            return {
                result: {
                    ok: false,
                    attachmentId,
                    error: "附件原文读取不可用",
                },
                files,
                isError: true,
            };
        }
        const data = await readText(attachmentId);
        return {
            result: {
                ok: true,
                attachmentId,
                name: data.name,
                text: data.text,
            },
            files,
            isError: false,
        };
    } catch (error) {
        return {
            result: {
                ok: false,
                attachmentId,
                error: error instanceof Error ? error.message : "附件读取失败",
            },
            files,
            isError: true,
        };
    }
}
