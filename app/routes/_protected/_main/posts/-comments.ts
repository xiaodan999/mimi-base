import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth, type User } from "@/lib/auth";
import pb from "@/lib/pb";

export type CommentData = {
    id: string;
    text: string;
    author: User;
    createdAt: string;
};

type CommentRecord = {
    id: string;
    text: string;
    created: string;
    expand?: {
        author_id?: User;
    };
};

const EMPTY_AUTHOR: User = {
    id: "",
    user_name: "",
    tou_xiang: "",
    circle: "",
};

export function useComments(postId: string, enabled = true) {
    return useQuery({
        queryKey: ["comments", postId],
        enabled,
        queryFn: async (): Promise<CommentData[]> => {
            const records = await pb
                .collection("comments")
                .getFullList<CommentRecord>({
                    sort: "created",
                    expand: "author_id,author_id.circle",
                    filter: pb.filter("post_id = {:postId}", { postId }),
                });

            return records.map((record) => ({
                id: record.id,
                text: record.text,
                author: record.expand?.author_id ?? EMPTY_AUTHOR,
                createdAt: record.created,
            }));
        },
    });
}

export function useNewCommentMutation(postId: string) {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["new_comment", postId],
        mutationFn: async ({ text }: { text: string }) => {
            // comment_count on the post is bumped by post_counters.pb.js.
            await pb.collection("comments").create({
                text,
                post_id: postId,
                author_id: user.id,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["comments", postId],
            });
            queryClient.invalidateQueries({ queryKey: ["posts"] });
        },
    });
}

export function useDeleteCommentMutation(postId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: ["delete_comment", postId],
        mutationFn: async ({ id }: { id: string }) => {
            await pb.collection("comments").delete(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["comments", postId],
            });
            queryClient.invalidateQueries({ queryKey: ["posts"] });
        },
    });
}
