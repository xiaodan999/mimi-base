import type { CommentData } from "@/lib/pb-types";

/**
 * Longest comment the composer and the inline editor accept. Kept well below
 * anything that would strain the sheet's layout; the server has no limit of
 * its own, so this is the shared client-side cap.
 */
export const MAX_COMMENT_LENGTH = 2000;

/**
 * PocketBase bumps the `updated` autodate on every save, so a comment counts
 * as edited only when that timestamp is strictly later than `created`.
 * Legacy rows and unedited comments have both values equal.
 */
export function isCommentEdited(
    comment: Pick<CommentData, "createdAt" | "updatedAt">,
): boolean {
    if (!comment.updatedAt) return false;
    // PB sends "YYYY-MM-DD HH:mm:ss.sssZ"; Safari needs the space swapped.
    const updated = Date.parse(comment.updatedAt.replace(" ", "T"));
    const created = Date.parse(comment.createdAt.replace(" ", "T"));
    if (Number.isNaN(updated) || Number.isNaN(created)) {
        return comment.updatedAt !== comment.createdAt;
    }
    return updated > created;
}

/**
 * Shared validation for new comments and edits: text is optional when the
 * comment already carries images ("看看这个"), but an empty text-only comment
 * is not allowed. Returns the user-facing message, or null when it can save.
 */
export function commentTextError(
    text: string,
    imageCount: number,
): string | null {
    const value = text.trim();
    if (!value && imageCount === 0) return "评论内容不能为空";
    if (value.length > MAX_COMMENT_LENGTH) {
        return `评论最多 ${MAX_COMMENT_LENGTH} 字`;
    }
    return null;
}
