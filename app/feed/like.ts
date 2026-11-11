import type { PostData } from "@/lib/pb-types";

/**
 * Apply one optimistic like toggle to a cached post.
 *
 * The button renders `liked` from the last render, so a second tap can arrive
 * before that render lands and ask for the state the cache already has. Adding
 * a ±1 per mutation then counted the same click twice: two fast taps on
 * 「取消点赞」 took 1 → 0 → -1. Deriving the change from the cached post makes a
 * repeated request a no-op, and the clamp keeps the displayed count sane if the
 * cache disagrees with the server while a refetch is in flight.
 *
 * The settle-time invalidation still reconciles everything with the server.
 */
export function applyLikeToggle(post: PostData, like: boolean): PostData {
    if (post.liked === like) return post;

    return {
        ...post,
        liked: like,
        metrics: {
            ...post.metrics,
            likeCount: Math.max(0, post.metrics.likeCount + (like ? 1 : -1)),
        },
    };
}
