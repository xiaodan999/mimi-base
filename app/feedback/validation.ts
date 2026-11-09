/**
 * Client-side validation shared by the form and its tests. The server-side
 * caps live in `pocketbase/pb_migrations/1795700000_add_feedback_reports.js`
 * (title 120, description 5000, 3 screenshots x 5MB) and are the backstop.
 */

export const MAX_FEEDBACK_TITLE = 120;
export const MAX_FEEDBACK_DESCRIPTION = 5000;
export const MAX_FEEDBACK_SCREENSHOTS = 3;
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export type ScreenshotLike = {
    name?: string;
    size?: number;
    type?: string;
};

export type FeedbackKind = "bug" | "feature";

export type FeedbackDraft = {
    kind?: FeedbackKind;
    title: string;
    description: string;
    screenshots?: readonly ScreenshotLike[];
};

export type FeedbackValidation =
    | { ok: true; title: string; description: string }
    | { ok: false; error: string };

export function validateFeedback(draft: FeedbackDraft): FeedbackValidation {
    const feature = draft.kind === "feature";
    const title = draft.title.trim();
    if (!title) return { ok: false, error: "请填写一句话标题" };
    if (title.length > MAX_FEEDBACK_TITLE) {
        return {
            ok: false,
            error: `标题最多 ${MAX_FEEDBACK_TITLE} 个字`,
        };
    }

    const description = draft.description.trim();
    if (!description) {
        return {
            ok: false,
            error: feature ? "请描述一下你的想法" : "请描述一下遇到的问题",
        };
    }
    if (description.length > MAX_FEEDBACK_DESCRIPTION) {
        return {
            ok: false,
            error: `描述最多 ${MAX_FEEDBACK_DESCRIPTION} 个字`,
        };
    }

    const screenshots = draft.screenshots ?? [];
    if (screenshots.length > MAX_FEEDBACK_SCREENSHOTS) {
        return {
            ok: false,
            error: `最多上传 ${MAX_FEEDBACK_SCREENSHOTS} 张${
                feature ? "图片" : "截图"
            }`,
        };
    }
    for (const file of screenshots) {
        if (!file.type || !file.type.startsWith("image/")) {
            return {
                ok: false,
                error: feature ? "照片需要是图片文件" : "截图需要是图片文件",
            };
        }
        if (typeof file.size === "number" && file.size > MAX_SCREENSHOT_BYTES) {
            return {
                ok: false,
                error: feature
                    ? "单张照片不能超过 5MB"
                    : "单张截图不能超过 5MB",
            };
        }
    }

    return { ok: true, title, description };
}
