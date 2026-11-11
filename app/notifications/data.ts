import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import type { RecordModel } from "pocketbase";

import { useCurrentUser } from "@/lib/auth";
import pb from "@/lib/pb";
import {
    type CommentRecord,
    EMPTY_AUTHOR,
    type PostRecord,
    toUser,
    type User,
    type UserRecord,
} from "@/lib/pb-types";
import { pairThumbs } from "@/lib/photoFiles";
import { qk } from "@/lib/query-keys";

import { type NotificationType, parseNotificationType } from "./format";

const PAGE_SIZE = 20;
const EXPAND = "actor,actor.circle,post,comment";

type NotificationRecord = RecordModel & {
    recipient: string;
    actor: string;
    type: string;
    post: string;
    comment?: string;
    read?: boolean;
    created: string;
    expand?: {
        actor?: UserRecord;
        post?: PostRecord;
        comment?: CommentRecord;
    };
};

/** Enough record data for `getFileUrl` to build a protected thumbnail URL. */
export type NotificationThumb = {
    id: string;
    collectionId: string;
    collectionName: string;
    filename: string;
};

export type NotificationData = {
    id: string;
    type: NotificationType;
    actor: User;
    postId: string;
    commentId: string;
    read: boolean;
    createdAt: string;
    postText: string;
    commentText: string;
    thumb?: NotificationThumb;
};

type NotificationPage = {
    items: NotificationData[];
    nextPage: number | null;
};

export function toNotificationData(
    record: NotificationRecord,
): NotificationData | null {
    const type = parseNotificationType(record.type);
    if (!type) return null;

    const post = record.expand?.post;
    const image = post
        ? pairThumbs(post.images ?? [], post.thumbs ?? [])[0]
        : undefined;
    const data: NotificationData = {
        id: record.id,
        type,
        actor: record.expand?.actor
            ? toUser(record.expand.actor)
            : EMPTY_AUTHOR,
        postId: record.post,
        commentId: record.comment ?? "",
        read: Boolean(record.read),
        createdAt: record.created,
        postText: post?.text ?? "",
        commentText: record.expand?.comment?.text ?? "",
    };
    if (post && image) {
        data.thumb = {
            id: post.id,
            collectionId: post.collectionId,
            collectionName: post.collectionName,
            filename: image.thumb ?? image.name,
        };
    }
    return data;
}

export function useNotifications() {
    const user = useCurrentUser();

    return useInfiniteQuery({
        queryKey: qk.notifications.list(user.id),
        queryFn: async ({
            pageParam = 1,
            signal,
        }): Promise<NotificationPage> => {
            const result = await pb
                .collection("notifications")
                .getList<NotificationRecord>(pageParam, PAGE_SIZE, {
                    sort: "-created",
                    expand: EXPAND,
                    signal,
                });

            return {
                items: result.items
                    .map(toNotificationData)
                    .filter((item): item is NotificationData => item !== null),
                nextPage:
                    result.page < result.totalPages ? result.page + 1 : null,
            };
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage) => lastPage.nextPage,
    });
}

export function useUnreadNotificationCount() {
    const user = useCurrentUser();

    return useQuery({
        queryKey: qk.notifications.unread(user.id),
        queryFn: async ({ signal }) => {
            const result = await pb.collection("notifications").getList(1, 1, {
                filter: "read = false",
                fields: "id",
                signal,
            });
            return result.totalItems;
        },
        staleTime: 30_000,
    });
}

export function useMarkNotificationRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) =>
            pb.collection("notifications").update(id, { read: true }),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: qk.notifications.all,
            });
        },
    });
}

export function useMarkAllNotificationsRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const rows = await pb
                .collection("notifications")
                .getFullList<{ id: string }>({
                    filter: "read = false",
                    fields: "id",
                });
            await Promise.all(
                rows.map((row) =>
                    pb.collection("notifications").update(row.id, {
                        read: true,
                    }),
                ),
            );
            return rows.length;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: qk.notifications.all,
            });
        },
    });
}
