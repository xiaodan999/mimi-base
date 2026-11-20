import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import pb from "@/lib/pb";
import { type PostData } from "@/lib/pb-types";
import { qk } from "@/lib/query-keys";
import { type RealtimeAction, registerRealtimeReducer } from "@/lib/realtime";

import { patchPostInPages, type PostsData } from "./pages";
import { applyCommentRealtime, applyLikeRealtime } from "./realtime-pure";

/**
 * Patch feed counters in place instead of invalidating `qk.posts.all`.
 *
 * An invalidation refetches every loaded page (and a second `post_likes`
 * query per page). A like on a 30-page feed used to cost ~60 requests; this
 * applies the event to the cached post and asks for one small counter read.
 */
export function createFeedRealtime(queryClient: QueryClient, viewerId: string) {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const patch = (postId: string, update: (post: PostData) => PostData) => {
        let touched = false;
        queryClient.setQueriesData<PostsData>(
            { queryKey: qk.posts.all },
            (old) => {
                const next = patchPostInPages(old, postId, update);
                if (next !== old) touched = true;
                return next;
            },
        );
        return touched;
    };

    const reconcile = (postId: string) => {
        const existing = timers.get(postId);
        if (existing) clearTimeout(existing);
        timers.set(
            postId,
            setTimeout(() => {
                timers.delete(postId);
                void pb
                    .collection("posts")
                    .getOne<{
                        like_count?: number;
                        comment_count?: number;
                    }>(postId, {
                        fields: "id,like_count,comment_count",
                    })
                    .then((record) => {
                        patch(postId, (post) => {
                            const likeCount =
                                record.like_count ?? post.metrics.likeCount;
                            const replyCount =
                                record.comment_count ?? post.metrics.replyCount;
                            if (
                                likeCount === post.metrics.likeCount &&
                                replyCount === post.metrics.replyCount
                            ) {
                                return post;
                            }
                            return {
                                ...post,
                                metrics: { likeCount, replyCount },
                            };
                        });
                    })
                    .catch(() => {
                        // The next event/refetch corrects it; a deleted post
                        // simply has no cache row left.
                    });
            }, 400),
        );
    };

    const reduceLike = ({
        action,
        record,
    }: {
        action: RealtimeAction;
        record: Record<string, unknown>;
    }) => {
        const postId = typeof record.post_id === "string" ? record.post_id : "";
        const actorId =
            typeof record.user_id === "string" ? record.user_id : "";
        if (!postId || !actorId) return false;
        const touched = patch(postId, (post) =>
            applyLikeRealtime(post, action, actorId, viewerId),
        );
        // A like on an old post outside the loaded pages needs no counter
        // request; the page will fetch fresh data if it is ever opened.
        if (touched) reconcile(postId);
        // The inbox derives from likes; the server deletes notification rows
        // with raw SQL, so this event is the only signal for an unlike.
        void queryClient.invalidateQueries({
            queryKey: qk.notifications.all,
        });
        return true;
    };

    const reduceComment = ({
        action,
        record,
    }: {
        action: RealtimeAction;
        record: Record<string, unknown>;
    }) => {
        const postId = typeof record.post_id === "string" ? record.post_id : "";
        if (!postId) return false;
        if (action === "create" || action === "delete") {
            const touched = patch(postId, (post) =>
                applyCommentRealtime(post, action),
            );
            if (touched) reconcile(postId);
        }
        // Only the affected thread, not every comment query + every feed page.
        void queryClient.invalidateQueries({
            queryKey: qk.comments.all(postId),
        });
        void queryClient.invalidateQueries({
            queryKey: qk.notifications.all,
        });
        return true;
    };

    const unregister = [
        registerRealtimeReducer("post_likes", reduceLike),
        registerRealtimeReducer("comments", reduceComment),
    ];
    return () => {
        for (const cleanup of unregister) cleanup();
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
    };
}

/** Mounted once in the protected shell so all cached feed variants are patched. */
export function useFeedRealtime(viewerId: string) {
    const queryClient = useQueryClient();
    useEffect(() => {
        if (!viewerId) return;
        return createFeedRealtime(queryClient, viewerId);
    }, [queryClient, viewerId]);
}
