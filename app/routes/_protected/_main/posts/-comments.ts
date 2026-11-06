import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useCurrentUser } from "@/lib/auth";
import pb from "@/lib/pb";
import {
    type CommentData,
    type CommentRecord,
    type CommentThread,
    toCommentData,
} from "@/lib/pb-types";
import { qk } from "@/lib/query-keys";

// The view-model shapes now live in lib/pb-types.ts; keep re-exporting them so
// components importing from `./-comments` don't need to change.
export type { CommentData, CommentThread } from "@/lib/pb-types";

export function useComments(postId: string, enabled = true) {
    return useQuery({
        queryKey: qk.comments.all(postId),
        enabled,
        queryFn: async ({ signal }): Promise<CommentData[]> => {
            const records = await pb
                .collection("comments")
                .getFullList<CommentRecord>({
                    sort: "created",
                    expand: "author_id,author_id.circle",
                    filter: pb.filter("post_id = {:postId}", { postId }),
                    signal,
                });

            return records.map(toCommentData);
        },
    });
}

/**
 * Groups a flat comment list into threads. Replies of any depth belong to the
 * nearest top-level ancestor; orphans (e.g. a deleted parent) become roots so
 * no comment disappears from the sheet.
 */
export function buildCommentThreads(comments: CommentData[]): CommentThread[] {
    const ids = new Set(comments.map((comment) => comment.id));
    const children = new Map<string, CommentData[]>();
    const roots: CommentData[] = [];

    for (const comment of comments) {
        if (!comment.parentId || !ids.has(comment.parentId)) {
            roots.push(comment);
            continue;
        }
        const siblings = children.get(comment.parentId) ?? [];
        siblings.push(comment);
        children.set(comment.parentId, siblings);
    }

    const collectReplies = (rootId: string) => {
        const replies: CommentData[] = [];
        const walk = (parentId: string) => {
            for (const child of children.get(parentId) ?? []) {
                replies.push(child);
                walk(child.id);
            }
        };
        walk(rootId);
        return replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    };

    return roots.map((root) => ({
        root,
        replies: collectReplies(root.id),
    }));
}

export function useNewCommentMutation(postId: string) {
    const user = useCurrentUser();
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: qk.mutations.newComment(postId),
        mutationFn: async ({
            text,
            parentId,
            images = [],
        }: {
            text: string;
            parentId?: string;
            images?: File[];
        }) => {
            // comment_count on the post is bumped by post_counters.pb.js.
            // Images upload as FormData in the same request as the record.
            const formData = new FormData();
            formData.append("text", text);
            formData.append("post_id", postId);
            formData.append("author_id", user.id);
            formData.append("parent_id", parentId ?? "");
            images.forEach((image) => formData.append("images", image));
            await pb.collection("comments").create(formData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: qk.comments.all(postId),
            });
            queryClient.invalidateQueries({ queryKey: qk.posts.all });
        },
    });
}

export function useDeleteCommentMutation(postId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationKey: qk.mutations.deleteComment(postId),
        mutationFn: async ({ id }: { id: string }) => {
            // Replies cascade; the counter hook runs for each removed record.
            await pb.collection("comments").delete(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: qk.comments.all(postId),
            });
            queryClient.invalidateQueries({ queryKey: qk.posts.all });
        },
    });
}
