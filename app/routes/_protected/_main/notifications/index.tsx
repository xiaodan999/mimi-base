import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck, Heart, MessageCircle } from "lucide-react";
import { useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { toast } from "sonner";

import { formatRelativeTime } from "@/app/feed/utils";
import {
    type NotificationData,
    useMarkAllNotificationsRead,
    useMarkNotificationRead,
    useNotifications,
    useUnreadNotificationCount,
} from "@/app/notifications/data";
import {
    notificationAction,
    notificationExcerpt,
    notificationSearch,
} from "@/app/notifications/format";
import { ErrorState } from "@/components/ErrorState";
import PageHeader from "@/components/PageHeader";
import TouXiang from "@/components/TouXiang";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { getFileUrl, getUserAvatarUrl, getUserRing } from "@/lib/pb";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_protected/_main/notifications/")({
    component: Page,
});

function Page() {
    const navigate = useNavigate();
    const notifications = useNotifications();
    const unread = useUnreadNotificationCount();
    const markRead = useMarkNotificationRead();
    const markAll = useMarkAllNotificationsRead();
    const { ref, inView } = useInView();

    const items = notifications.data?.pages.flatMap((page) => page.items) ?? [];
    const unreadCount = unread.data ?? 0;

    useEffect(() => {
        if (
            !inView ||
            !notifications.hasNextPage ||
            notifications.isFetchingNextPage
        ) {
            return;
        }
        void notifications.fetchNextPage();
    }, [
        inView,
        notifications.hasNextPage,
        notifications.isFetchingNextPage,
        notifications.fetchNextPage,
    ]);

    const open = (item: NotificationData) => {
        if (!item.read) markRead.mutate(item.id);
        void navigate({
            to: "/home",
            search: notificationSearch(item.type, item.postId),
        });
    };

    const readAll = async () => {
        if (unreadCount === 0 || markAll.isPending) return;
        try {
            const count = await markAll.mutateAsync();
            toast.success(
                count > 0 ? `已把 ${count} 条消息标记为已读` : "没有未读消息",
            );
        } catch {
            toast.error("标记失败，请再试一次");
        }
    };

    return (
        <div className="mx-auto w-full max-w-md px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-28">
            <PageHeader
                backTo="/home"
                backLabel="返回首页"
                title="互动消息"
                description={
                    unreadCount > 0
                        ? `${unreadCount} 条未读`
                        : "点赞、评论和回复都会收在这里"
                }
                actions={
                    <button
                        type="button"
                        onClick={() => void readAll()}
                        disabled={unreadCount === 0 || markAll.isPending}
                        className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-primary transition-colors active:bg-primary/10 disabled:text-muted-foreground disabled:opacity-50"
                    >
                        {markAll.isPending ? (
                            <LoadingSpinner size={14} />
                        ) : (
                            <CheckCheck
                                className="size-3.5"
                                aria-hidden="true"
                            />
                        )}
                        全部已读
                    </button>
                }
            />

            {notifications.isPending ? (
                <div className="grid place-items-center py-20">
                    <LoadingSpinner />
                </div>
            ) : notifications.isError ? (
                <div className="mt-4">
                    <ErrorState
                        message={notifications.error?.message ?? "消息加载失败"}
                        onRetry={() => void notifications.refetch()}
                    />
                </div>
            ) : items.length === 0 ? (
                <div className="mt-6 rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center">
                    <Bell className="mx-auto size-8 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">还没有互动消息</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        有人赞了你的动态或评论、评论或回复你时，会出现在这里。
                    </p>
                    <Link
                        to="/home"
                        className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                    >
                        去动态看看
                    </Link>
                </div>
            ) : (
                <>
                    <div className="mt-4 divide-y divide-border/60 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-soft">
                        {items.map((item) => (
                            <NotificationRow
                                key={item.id}
                                item={item}
                                onOpen={() => open(item)}
                            />
                        ))}
                    </div>
                    <div className="flex min-h-12 items-center justify-center py-2">
                        {notifications.hasNextPage ? (
                            <div ref={ref} className="flex h-8 items-center">
                                {notifications.isFetchingNextPage && (
                                    <LoadingSpinner />
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                到底了...
                            </p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function NotificationRow({
    item,
    onOpen,
}: {
    item: NotificationData;
    onOpen: () => void;
}) {
    const likes = item.type === "post_like" || item.type === "comment_like";
    const Icon = likes ? Heart : MessageCircle;
    const excerpt = notificationExcerpt(
        item.type,
        item.postText,
        item.commentText,
    );

    return (
        <button
            type="button"
            onClick={onOpen}
            className={cn(
                "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors active:bg-accent",
                !item.read && "bg-primary/[0.035]",
            )}
        >
            <span className="relative shrink-0">
                <TouXiang
                    size={44}
                    touXiangUrl={getUserAvatarUrl(item.actor)}
                    name={item.actor.user_name}
                    {...getUserRing(item.actor)}
                />
                <span
                    aria-hidden="true"
                    className={cn(
                        "absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full border-2 border-card text-white",
                        likes ? "bg-rose-500" : "bg-primary",
                    )}
                >
                    <Icon className="size-2.5" />
                </span>
            </span>

            <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm leading-5">
                    <span className="font-semibold">
                        {item.actor.user_name || "朋友"}
                    </span>{" "}
                    <span className="text-muted-foreground">
                        {notificationAction(item.type)}
                    </span>
                    {excerpt !== "查看详情" && (
                        <span className="text-muted-foreground">
                            ：{excerpt}
                        </span>
                    )}
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                    {formatRelativeTime(item.createdAt)}
                </span>
            </span>

            {item.thumb && (
                <img
                    src={getFileUrl(item.thumb, item.thumb.filename)}
                    alt=""
                    loading="lazy"
                    className="size-12 shrink-0 rounded-xl bg-muted object-cover"
                />
            )}

            {!item.read && (
                <>
                    <span
                        aria-hidden="true"
                        className="mt-1 size-2 shrink-0 rounded-full bg-primary"
                    />
                    <span className="sr-only">未读</span>
                </>
            )}
        </button>
    );
}
