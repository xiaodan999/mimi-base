import { useCallback } from "react";
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type InfiniteData,
} from "@tanstack/react-query";

import { useCurrentUser } from "@/lib/auth";
import pb, { pbDate } from "@/lib/pb";
import {
    type PostData,
    type PostLayout,
    type PostLikeRecord,
    type PostRecord,
    toPostData,
} from "@/lib/pb-types";
import { qk } from "@/lib/query-keys";

import { groupPostMonths } from "./-utils";

// The view-model shapes now live in lib/pb-types.ts; keep re-exporting them so
// components importing from `./-data` don't need to change.
export type { PostData, PostImage, PostLayout } from "@/lib/pb-types";

type PostsPage = {
    posts: PostData[];
    nextPage: number | null;
    total: number;
};

export type PostFilter = {
    /** "YYYY-MM" — show only that month. */
    month?: string;
    /** Case-insensitive text search over the post body. */
    q?: string;
};

/** Stable cache-key suffix for a feed filter. */
export function postFilterKey(filter: PostFilter = {}) {
    if (filter.month) return `month:${filter.month}`;
    if (filter.q) return `q:${filter.q}`;
    return "latest";
}

function buildFilter({ month, q }: PostFilter) {
    const clauses: string[] = [];
    const params: Record<string, string> = {};

    if (month) {
        const [year, monthIndex] = month.split("-").map(Number);
        if (year && monthIndex) {
            // Half-open range in local time: [first of month, first of next).
            const from = new Date(year, monthIndex - 1, 1);
            const to = new Date(year, monthIndex, 1);
            clauses.push("created >= {:from} && created < {:to}");
            params.from = pbDate(from);
            params.to = pbDate(to);
        }
    }

    if (q) {
        // `~` is PocketBase's case-insensitive LIKE.
        clauses.push("text ~ {:q}");
        params.q = q;
    }

    return clauses.length ? pb.filter(clauses.join(" && "), params) : "";
}

const POST_EXPAND = "author_id,author_id.circle";

/**
 * Only the likes for the ids on this page are needed. The old version pulled
 * the user's entire like history on every page, which grows forever.
 */
async function fetchLikedPostIds(
    userId: string,
    postIds: string[],
    signal?: AbortSignal,
): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();

    const params: Record<string, string> = { userId };
    const clauses = postIds.map((postId, index) => {
        const key = `post${index}`;
        params[key] = postId;
        return `post_id = {:${key}}`;
    });

    const likes = await pb
        .collection("post_likes")
        .getFullList<PostLikeRecord>({
            filter: pb.filter(
                `user_id = {:userId} && (${clauses.join(" || ")})`,
                params,
            ),
            signal,
        });
    return new Set(likes.map((like) => like.post_id));
}

export function usePostsInfinite(pageSize = 10, filter: PostFilter = {}) {
    const user = useCurrentUser();
    const queryClient = useQueryClient();
    const queryKey = qk.posts.list(user.id, postFilterKey(filter));

    const query = useInfiniteQuery({
        queryKey,
        // A deep-scrolled feed has to stay in memory while the user visits
        // another tab; otherwise remounting it starts from a skeleton and the
        // restored scroll position has no content to land on.
        gcTime: 30 * 60_000,
        // Keep the feed fresh long enough that a window refocus doesn't
        // re-fetch every loaded page. Pull-to-refresh uses `refresh()` below,
        // which explicitly reloads only the newest page.
        staleTime: 5 * 60_000,
        // Deliberately NO `maxPages`: for a forward-only query TanStack trims
        // with `addToEnd`, which drops the FIRST cached page — page 1, the
        // newest posts. Past ~20 scrolled pages every invalidation and every
        // pull-to-refresh would refetch from page 2+ instead, so a post that
        // was just published could never appear. `gcTime` bounds the cache.
        queryFn: async ({ pageParam = 1, signal }): Promise<PostsPage> => {
            const page = pageParam as number;
            const filterExpr = buildFilter(filter);
            // Posts carry denormalized like_count / comment_count, the author
            // comes from the expand.
            const result = await pb
                .collection("posts")
                .getList<PostRecord>(page, pageSize, {
                    sort: "-created",
                    expand: POST_EXPAND,
                    ...(filterExpr ? { filter: filterExpr } : {}),
                    signal,
                });

            const likedPostIds = await fetchLikedPostIds(
                user.id,
                result.items.map((post) => post.id),
                signal,
            );

            return {
                posts: result.items.map((post) =>
                    toPostData(post, likedPostIds),
                ),
                nextPage:
                    result.page < result.totalPages ? result.page + 1 : null,
                total: result.totalItems,
            };
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage) => lastPage.nextPage,
    });

    // `refetch()` on an infinite query re-fetches every loaded page. For
    // pull-to-refresh we only want the newest page: trim the cache down to a
    // single page first, then refetch just that page.
    const { refetch } = query;
    const refresh = useCallback(() => {
        queryClient.setQueryData<InfiniteData<PostsPage>>(queryKey, (old) =>
            old && old.pages.length > 1
                ? {
                      pages: old.pages.slice(0, 1),
                      pageParams: old.pageParams.slice(0, 1),
                  }
                : old,
        );
        return refetch();
    }, [queryClient, queryKey, refetch]);

    return { ...query, refresh };
}

/**
 * Months that contain at least one post, newest first. Only timestamps are
 * fetched, so this stays cheap even after years of posting.
 */
export function usePostMonths(enabled = true) {
    const user = useCurrentUser();

    return useQuery({
        queryKey: qk.posts.months(user.id),
        enabled,
        staleTime: 5 * 60_000,
        queryFn: async ({ signal }) => {
            const rows = await pb
                .collection("posts")
                .getFullList<{ created: string }>({
                    fields: "created",
                    signal,
                });
            return groupPostMonths(rows.map((row) => row.created));
        },
    });
}

export function usePostLikeMutation() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();
    // Every cached feed variant (latest / month / search) can show this post.
    const feedKey = qk.posts.lists(user.id);

    return useMutation({
        mutationKey: qk.mutations.postLike(),
        mutationFn: async ({
            postId,
            like,
        }: {
            postId: string;
            like: boolean;
        }) => {
            if (like) {
                await pb.collection("post_likes").create({
                    post_id: postId,
                    user_id: user.id,
                });
                return true;
            }

            const likeRecord = await pb
                .collection("post_likes")
                .getFirstListItem<{ id: string }>(
                    pb.filter("post_id = {:postId} && user_id = {:userId}", {
                        postId,
                        userId: user.id,
                    }),
                );
            await pb.collection("post_likes").delete(likeRecord.id);
            return true;
        },
        onMutate: async ({ postId, like }) => {
            // Cancel any outgoing refetches
            // (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: feedKey });

            const previousFeeds = queryClient.getQueriesData<
                InfiniteData<PostsPage>
            >({ queryKey: feedKey });

            // The cache holds infinite queries: { pages: PostsPage[] }.
            queryClient.setQueriesData<InfiniteData<PostsPage>>(
                { queryKey: feedKey },
                (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map((page) => ({
                            ...page,
                            posts: page.posts.map((post) =>
                                post.id === postId
                                    ? {
                                          ...post,
                                          liked: like,
                                          metrics: {
                                              ...post.metrics,
                                              likeCount:
                                                  post.metrics.likeCount +
                                                  (like ? 1 : -1),
                                          },
                                      }
                                    : post,
                            ),
                        })),
                    };
                },
            );

            return { previousFeeds };
        },
        onError: (err, updatedPost, context) => {
            // Roll back only the optimistic like; the post itself is fine.
            context?.previousFeeds.forEach(([key, data]) =>
                queryClient.setQueryData(key, data),
            );
        },
        onSettled: () => {
            // like_count / comment_count are maintained by the server hook, so
            // reconcile the optimistic row with the real counters once the
            // write settles instead of letting them drift.
            void queryClient.invalidateQueries({ queryKey: feedKey });
        },
    });
}

export function useNewPostMutation() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: qk.mutations.newPost(),
        mutationFn: async ({
            text,
            layout,
            images,
            thumbs,
        }: {
            text: string;
            layout: PostLayout;
            images: File[];
            thumbs: File[];
        }) => {
            // PocketBase has no column default for author_id, send it. Files
            // upload in the same request as the record, thumbnails included so
            // a post is never saved with images and no grid previews.
            const formData = new FormData();
            formData.append("text", text);
            formData.append("layout", layout);
            formData.append("author_id", user.id);
            images.forEach((image) => formData.append("images", image));
            thumbs.forEach((thumb) => formData.append("thumbs", thumb));

            const record = await pb
                .collection("posts")
                .create<PostRecord>(formData);
            // A hook chain that never calls `e.next()` answers 200 with an
            // empty body, which the SDK resolves like a success. Only report
            // a post as published when the server actually returned it.
            if (!record?.id) {
                throw new Error("发布失败：服务器没有返回新动态");
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qk.posts.all });
            queryClient.invalidateQueries({ queryKey: qk.homeStats.all });
        },
    });
}

export function useUpdatePostMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: qk.mutations.updatePost(),
        mutationFn: async ({
            id,
            text,
            layout,
            keepImages,
            keepThumbs,
            files,
            thumbs,
        }: {
            id: string;
            text: string;
            layout: PostLayout;
            /** Existing filenames kept by the edit form, in visual order. */
            keepImages: string[];
            /** Existing thumbnail filenames kept by the edit form. */
            keepThumbs: string[];
            /** Newly added files. */
            files: File[];
            /** Newly generated thumbnails. */
            thumbs: File[];
        }) => {
            const formData = new FormData();
            formData.append("text", text);
            formData.append("layout", layout);
            keepImages.forEach((name) => formData.append("images", name));
            files.forEach((file) => formData.append("images", file));
            keepThumbs.forEach((name) => formData.append("thumbs", name));
            thumbs.forEach((file) => formData.append("thumbs", file));

            // Omitting a field from an update leaves its current files
            // untouched; an empty value is what clears them.
            if (keepImages.length === 0 && files.length === 0) {
                formData.append("images", "");
            }
            if (keepThumbs.length === 0 && thumbs.length === 0) {
                formData.append("thumbs", "");
            }

            const record = await pb
                .collection("posts")
                .update<PostRecord>(id, formData);
            // Same empty-200 trap as create: a save that returns no record
            // never reached the database.
            if (!record?.id) {
                throw new Error("保存失败：服务器没有返回动态");
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qk.posts.all });
            queryClient.invalidateQueries({ queryKey: qk.homeStats.all });
        },
    });
}

export function useDeletePostMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: qk.mutations.deletePost(),
        mutationFn: async ({ id }: { id: string }) => {
            const deleted = await pb.collection("posts").delete(id);
            if (!deleted) throw new Error("Failed to delete the post " + id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: qk.posts.all });
            queryClient.invalidateQueries({ queryKey: qk.homeStats.all });
        },
    });
}
