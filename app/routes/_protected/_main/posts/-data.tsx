import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type InfiniteData,
} from "@tanstack/react-query";

import { useCurrentUser, type User } from "@/lib/auth";
import pb, { pbDate } from "@/lib/pb";
import { qk } from "@/lib/query-keys";

import { groupPostMonths } from "./-utils";

export type PostLayout = "moments" | "instagram";

export type PostImage = {
    name: string;
};

export type PostData = {
    id: string;
    text: string;
    author: User;
    createdAt: string;
    liked: boolean;
    layout: PostLayout;
    // Needed to build protected file URLs at render time.
    collectionId: string;
    images: PostImage[];
    metrics: {
        likeCount: number;
        replyCount: number;
    };
};

type PostRecord = {
    id: string;
    text: string;
    created: string;
    like_count: number;
    comment_count: number;
    images?: string[];
    layout?: string;
    // Files are served relative to the record's collection/record id.
    collectionId: string;
    collectionName: string;
    expand?: {
        author_id?: User;
    };
};

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

const EMPTY_AUTHOR: User = {
    id: "",
    user_name: "",
    tou_xiang: "",
    circle: "",
};

function toPostData(post: PostRecord, likedPostIds: Set<string>): PostData {
    return {
        id: post.id,
        text: post.text,
        author: post.expand?.author_id ?? EMPTY_AUTHOR,
        createdAt: post.created,
        liked: likedPostIds.has(post.id),
        layout: post.layout === "instagram" ? "instagram" : "moments",
        collectionId: post.collectionId,
        images: (post.images ?? []).map((name) => ({ name })),
        metrics: {
            likeCount: post.like_count ?? 0,
            replyCount: post.comment_count ?? 0,
        },
    };
}

/**
 * Only the likes for the ids on this page are needed. The old version pulled
 * the user's entire like history on every page, which grows forever.
 */
async function fetchLikedPostIds(
    userId: string,
    postIds: string[],
): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();

    const params: Record<string, string> = { userId };
    const clauses = postIds.map((postId, index) => {
        const key = `post${index}`;
        params[key] = postId;
        return `post_id = {:${key}}`;
    });

    const likes = await pb.collection("post_likes").getFullList<{
        post_id: string;
    }>({
        filter: pb.filter(
            `user_id = {:userId} && (${clauses.join(" || ")})`,
            params,
        ),
    });
    return new Set(likes.map((like) => like.post_id));
}

export function usePostsInfinite(pageSize = 10, filter: PostFilter = {}) {
    const user = useCurrentUser();

    return useInfiniteQuery({
        queryKey: qk.posts.list(user.id, postFilterKey(filter)),
        // A deep-scrolled feed has to stay in memory while the user visits
        // another tab; otherwise remounting it starts from a skeleton and the
        // restored scroll position has no content to land on.
        gcTime: 30 * 60_000,
        queryFn: async ({ pageParam = 1 }): Promise<PostsPage> => {
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
                });

            const likedPostIds = await fetchLikedPostIds(
                user.id,
                result.items.map((post) => post.id),
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
        queryFn: async () => {
            const rows = await pb
                .collection("posts")
                .getFullList<{ created: string }>({ fields: "created" });
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
        mutationKey: ["mutate_post_like"],
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
        // No settle-time invalidation: the optimistic row is the source of
        // truth until the next natural refetch, so liking doesn't refetch the
        // whole feed.
    });
}

export function useNewPostMutation() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["new_post"],
        mutationFn: async ({
            text,
            layout,
            images,
        }: {
            text: string;
            layout: PostLayout;
            images: File[];
        }) => {
            // PocketBase has no column default for author_id, send it. Files
            // upload in the same request as the record.
            const formData = new FormData();
            formData.append("text", text);
            formData.append("layout", layout);
            formData.append("author_id", user.id);
            images.forEach((image) => formData.append("images", image));

            await pb.collection("posts").create(formData);
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
        mutationKey: ["update_post"],
        mutationFn: async ({
            id,
            text,
            layout,
            keepImages,
            files,
        }: {
            id: string;
            text: string;
            layout: PostLayout;
            /** Existing filenames kept by the edit form, in visual order. */
            keepImages: string[];
            /** Newly added files. */
            files: File[];
        }) => {
            const formData = new FormData();
            formData.append("text", text);
            formData.append("layout", layout);
            keepImages.forEach((name) => formData.append("images", name));
            files.forEach((file) => formData.append("images", file));

            // Omitting `images` from an update leaves the current files
            // untouched; an empty value is what clears them.
            if (keepImages.length === 0 && files.length === 0) {
                formData.append("images", "");
            }

            await pb.collection("posts").update(id, formData);
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
        mutationKey: ["delete_post"],
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
