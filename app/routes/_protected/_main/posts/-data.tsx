import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from "@tanstack/react-query";

import { queryClient } from "@/app/main";
import { useAuth, type User } from "@/lib/auth";
import pb from "@/lib/pb";

export type PostData = {
    id: string;
    text: string;
    author: User;
    createdAt: string;
    liked: boolean;
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
    expand?: {
        author_id?: User;
    };
};

type PostsPage = {
    posts: PostData[];
    nextPage: number | null;
};

// export type CommentData = {
//     id: string;
//     text: string;
// };

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
        metrics: {
            likeCount: post.like_count ?? 0,
            replyCount: post.comment_count ?? 0,
        },
    };
}

/**
 * PocketBase has no count aggregation, so the per-user likes are fetched once
 * and turned into a lookup set.
 */
async function fetchCurrentUserLikeIds(userId: string): Promise<Set<string>> {
    const likes = await pb.collection("post_likes").getFullList<{
        post_id: string;
    }>({
        filter: pb.filter("user_id = {:userId}", { userId }),
    });
    return new Set(likes.map((like) => like.post_id));
}

export function usePostsInfinite(pageSize = 10) {
    const { user } = useAuth();

    return useInfiniteQuery({
        queryKey: ["posts"],
        queryFn: async ({ pageParam = 1 }): Promise<PostsPage> => {
            const page = pageParam as number;
            // Posts carry denormalized like_count / comment_count, the author
            // comes from the expand.
            const [result, likedPostIds] = await Promise.all([
                pb.collection("posts").getList<PostRecord>(page, pageSize, {
                    sort: "-created",
                    expand: POST_EXPAND,
                }),
                fetchCurrentUserLikeIds(user.id),
            ]);

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
    const { user } = useAuth();
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
            await queryClient.cancelQueries({ queryKey: ["posts"] });

            const previousPosts = queryClient.getQueriesData({
                queryKey: ["posts"],
            });

            // The cache holds an infinite query: { pages: PostsPage[] }.
            queryClient.setQueryData<{
                pages: PostsPage[];
                pageParams: unknown[];
            }>(["posts"], (old) => {
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
            context?.previousPosts.forEach(([key, value]) => {
                queryClient.setQueryData(key, value);
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["posts"] });
        },
    });
}

export function useNewPostMutation() {
    const { user } = useAuth();
    return useMutation({
        mutationKey: ["new_post"],
        mutationFn: async ({ text }: { text: string }) => {
            // PocketBase has no column default for author_id, send it.
            await pb.collection("posts").create({
                text,
                author_id: user.id,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["posts"] });
        },
    });
}

export function useDeletePostMutation() {
    return useMutation({
        mutationKey: ["delete_post"],
        mutationFn: async ({ id }: { id: string }) => {
            const deleted = await pb.collection("posts").delete(id);
            if (!deleted) throw new Error("Failed to delete the post " + id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["posts"] });
        },
    });
}
