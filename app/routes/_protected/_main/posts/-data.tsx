import { useMutation, useQuery } from "@tanstack/react-query";

import { queryClient } from "@/app/main";
import { useAuth, User } from "@/lib/auth";
import supabase from "@/lib/supabase-client";

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

// export type CommentData = {
//     id: string;
//     text: string;
// };

export function usePosts() {
    const { user } = useAuth();
    return useQuery({
        queryKey: ["posts"],
        queryFn: async () => {
            const { data: posts } = await supabase
                .from("posts")
                .select(
                    `id, text, author:users(id,user_name,tou_xiang,...tou-xiang-circle(circle:url)), 
                     createdAt:created_at, post_likes!inner(count), comments!inner(count)`,
                )
                .order("created_at", { ascending: false })
                .returns<PostData[]>()
                .throwOnError();
            if (!posts) throw new Error("Cannot find any posts.");

            // add liked to each post
            const { data: likes } = await supabase
                .from("post_likes")
                .select("post_id")
                .in(
                    "post_id",
                    posts.map((post) => post.id),
                )
                .eq("user_id", user.id)
                .throwOnError();

            if (!likes)
                throw new Error(
                    "Unable to fetch the user's likes info for each posts",
                );

            posts.forEach((post) => {
                post.metrics = {
                    // @ts-expect-error silly sb
                    likeCount: post.post_likes[0].count,
                    // @ts-expect-error silly sb
                    replyCount: post.comments[0].count,
                };

                post.liked =
                    likes.findIndex(
                        (likedPost) => likedPost.post_id === post.id,
                    ) !== -1;
            });

            return posts;
        },
    });
}

export function usePostLikeMutation() {
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
                const { data } = await supabase
                    .from("post_likes")
                    .insert({ post_id: postId })
                    .select("id")
                    .throwOnError();

                if (data?.length === 1) {
                    return true;
                } else {
                    throw new Error("Fail to like the post");
                }
            } else {
                const { data } = await supabase
                    .from("post_likes")
                    .delete()
                    .eq("post_id", postId)
                    .select("id")
                    .throwOnError();
                if (data?.length === 1) {
                    return true;
                } else {
                    throw new Error("Fail to undo the like on the post");
                }
            }
        },
        onMutate: async ({ postId, like }) => {
            // Cancel any outgoing refetches
            // (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: ["posts"] });

            const previousPosts = queryClient.getQueriesData({
                queryKey: ["posts"],
            });

            queryClient.setQueryData(["posts"], (old: PostData[]) => {
                const newPosts = [...old];
                const postToUpdateIndex = newPosts.findIndex(
                    (post) => post.id === postId,
                );
                if (postToUpdateIndex !== -1) {
                    const postToUpdate = newPosts[postToUpdateIndex];
                    newPosts[postToUpdateIndex] = {
                        ...postToUpdate,
                        liked: like,
                        metrics: {
                            ...postToUpdate.metrics,
                            likeCount:
                                postToUpdate.metrics.likeCount +
                                (like ? 1 : -1),
                        },
                    };
                }
                return newPosts;
            });

            return { previousPosts };
        },
        onError: (err, updatedPost, context) => {
            queryClient.setQueryData(["posts"], context?.previousPosts);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["posts"] });
        },
    });
}

export function useNewPostMutation() {
    return useMutation({
        mutationKey: ["new_post"],
        mutationFn: async ({ text }: { text: string }) => {
            await supabase
                .from("posts")
                .insert({
                    text,
                })
                .throwOnError();
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
            const { data } = await supabase
                .from("posts")
                .delete()
                .eq("id", id)
                .select("id")
                .throwOnError();
            if (data?.length !== 1)
                throw new Error("Failed to delete the post " + id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["posts"] });
        },
    });
}
