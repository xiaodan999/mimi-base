/**
 * Client-side validation shared by the form and its tests. The supervisor
 * (`pocketbase/feedback.ts`) enforces the same caps for uploaded attachments
 * (3 files, 10MB each, any MIME type) and is the backstop; nothing but
 * metadata is written to `feedback_reports`, so the collection itself no
 * longer caps file size.
 */

export const MAX_FEEDBACK_TITLE = 120;
export const MAX_FEEDBACK_DESCRIPTION = 5000;
export const MAX_FEEDBACK_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type AttachmentLike = {
    name?: string;
    size?: number;
    type?: string;
};

export type FeedbackKind = "bug" | "feature";

export type FeedbackDraft = {
    kind?: FeedbackKind;
    title: string;
    description: string;
    attachments?: readonly AttachmentLike[];
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

    const attachments = draft.attachments ?? [];
    if (attachments.length > MAX_FEEDBACK_ATTACHMENTS) {
        return {
            ok: false,
            error: `最多上传 ${MAX_FEEDBACK_ATTACHMENTS} 个附件`,
        };
    }
    for (const file of attachments) {
        // Any MIME type is allowed (logs, zips, PDFs, ...); only size is
        // capped. An empty type is common for uncommon extensions and is not
        // a reason to reject the file here.
        if (typeof file.size === "number" && file.size > MAX_ATTACHMENT_BYTES) {
            return {
                ok: false,
                error: `单个附件不能超过 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB`,
            };
        }
    }

    return { ok: true, title, description };
}
