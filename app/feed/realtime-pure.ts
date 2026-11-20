import type { PostData } from "@/lib/pb-types";
import type { RealtimeAction } from "@/lib/realtime";

import { applyLikeToggle } from "./like";

/**
 * Pure event-to-post transforms for the feed realtime reducers. Kept free of
 * `pb`/React so they can be unit-tested without a browser environment.
 */

/** Apply one `post_likes` event to a cached post. */
export function applyLikeRealtime(
    post: PostData,
    action: RealtimeAction,
    actorId: string,
    viewerId: string,
): PostData {
    if (action === "update") return post;

    if (actorId === viewerId) {
        // Our own like also arrives over SSE. The optimistic update already
        // moved the cache, so this is a no-op unless another tab changed it.
        return applyLikeToggle(post, action === "create");
    }

    const delta = action === "create" ? 1 : -1;
    const likeCount = Math.max(0, post.metrics.likeCount + delta);
    if (likeCount === post.metrics.likeCount) return post;
    return {
        ...post,
        metrics: { ...post.metrics, likeCount },
    };
}

/** Apply one comment create/delete to a cached post's reply count. */
export function applyCommentRealtime(
    post: PostData,
    action: RealtimeAction,
): PostData {
    if (action === "update") return post;
    const delta = action === "create" ? 1 : -1;
    const replyCount = Math.max(0, post.metrics.replyCount + delta);
    if (replyCount === post.metrics.replyCount) return post;
    return {
        ...post,
        metrics: { ...post.metrics, replyCount },
    };
}
