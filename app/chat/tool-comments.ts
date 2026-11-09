/**
 * Compact comment previews for the `get_comments` result card. Tool results
 * persist plain JSON, so this pure helper turns them into rows the card can
 * render and `bun test` can cover. No URLs or external content are involved.
 */

export type ToolCommentPreview = {
    id: string;
    /** Display name of the commenter. */
    by: string;
    /** Comment text, shortened for the collapsed card. */
    text: string;
    /** Parent comment's author when this row is a reply. */
    replyTo: string;
};

export const MAX_COMMENT_PREVIEWS = 4;
const MAX_PREVIEW_TEXT_CHARS = 140;

export function commentPreviews(
    result: unknown,
    max = MAX_COMMENT_PREVIEWS,
): { items: ToolCommentPreview[]; total: number } {
    if (typeof result !== "object" || result === null) {
        return { items: [], total: 0 };
    }
    const raw = (result as { items?: unknown }).items;
    if (!Array.isArray(raw)) return { items: [], total: 0 };

    const items: ToolCommentPreview[] = [];
    let total = 0;
    for (const value of raw) {
        if (typeof value !== "object" || value === null) continue;
        const row = value as Record<string, unknown>;
        const by = typeof row.by === "string" ? row.by.trim() : "";
        const images = typeof row.images === "number" ? row.images : 0;
        const body = typeof row.text === "string" ? row.text.trim() : "";
        // Image-only comments are valid (text is optional in the schema).
        const text = body !== "" ? body : images > 0 ? "（图片评论）" : "";
        if (by === "" || text === "") continue;
        total += 1;
        if (items.length >= max) continue;
        items.push({
            id: typeof row.id === "string" ? row.id : "",
            by,
            text:
                text.length > MAX_PREVIEW_TEXT_CHARS
                    ? `${text.slice(0, MAX_PREVIEW_TEXT_CHARS)}…`
                    : text,
            replyTo: typeof row.replyTo === "string" ? row.replyTo.trim() : "",
        });
    }
    return { items, total };
}
