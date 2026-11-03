import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from "@tanstack/react-query";

import { useCurrentUser, type User } from "@/lib/auth";
import pb from "@/lib/pb";
import { qk } from "@/lib/query-keys";

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
};

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

export function usePostsInfinite(pageSize = 10) {
    const user = useCurrentUser();

    return useInfiniteQuery({
        queryKey: qk.posts.list(user.id),
        queryFn: async ({ pageParam = 1 }): Promise<PostsPage> => {
            const page = pageParam as number;
            // Posts carry denormalized like_count / comment_count, the author
            // comes from the expand.
            const result = await pb
                .collection("posts")
                .getList<PostRecord>(page, pageSize, {
                    sort: "-created",
                    expand: POST_EXPAND,
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
            };
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage) => lastPage.nextPage,
    });
}

export function usePostLikeMutation() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();
    const userPostsKey = qk.posts.list(user.id);

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
            await queryClient.cancelQueries({ queryKey: userPostsKey });

            const previousPosts = queryClient.getQueryData<{
                pages: PostsPage[];
                pageParams: unknown[];
            }>(userPostsKey);

            // The cache holds an infinite query: { pages: PostsPage[] }.
            queryClient.setQueryData<{
                pages: PostsPage[];
                pageParams: unknown[];
            }>(userPostsKey, (old) => {
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
            });

            return { previousPosts };
        },
        onError: (err, updatedPost, context) => {
            // Roll back only the optimistic like; the post itself is fine.
            if (context?.previousPosts) {
                queryClient.setQueryData(userPostsKey, context.previousPosts);
            }
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
