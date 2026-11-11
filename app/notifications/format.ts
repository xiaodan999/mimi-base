/**
 * Pure presentation helpers for the interaction inbox, kept separate from the
 * PocketBase hooks/data layer so they can be unit-tested.
 */

export type NotificationType =
    "post_like" | "comment_like" | "post_comment" | "comment_reply";

export type NotificationSearch = {
    post: string;
    comments?: "1";
};

export function parseNotificationType(value: string): NotificationType | null {
    switch (value) {
        case "post_like":
        case "comment_like":
        case "post_comment":
        case "comment_reply":
            return value;
        default:
            return null;
    }
}

/** The action phrase that follows the actor's name. */
export function notificationAction(type: NotificationType): string {
    switch (type) {
        case "post_like":
            return "赞了你的动态";
        case "comment_like":
            return "赞了你的评论";
        case "post_comment":
            return "评论了你的动态";
        case "comment_reply":
            return "回复了你的评论";
    }
}

/** Comment-related notifications open the comment sheet, not just the post. */
export function opensComments(type: NotificationType): boolean {
    return type !== "post_like";
}

/** Excerpt shown under the action line. */
export function notificationExcerpt(
    type: NotificationType,
    postText: string,
    commentText: string,
): string {
    const text =
        type === "post_like"
            ? postText
            : type === "post_comment" || type === "comment_reply"
              ? commentText
              : commentText || postText;
    return text.trim() || "查看详情";
}

/** Home feed search that selects the notified post and optionally opens comments. */
export function notificationSearch(
    type: NotificationType,
    postId: string,
): NotificationSearch {
    const search: NotificationSearch = { post: postId };
    if (opensComments(type)) search.comments = "1";
    return search;
}
