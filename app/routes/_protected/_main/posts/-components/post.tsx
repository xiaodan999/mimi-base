import { HeartFill } from "antd-mobile-icons";
import { Ellipsis, Heart, MessageCircle, Pencil, Trash2 } from "lucide-react";

import TouXiang from "@/components/TouXiang";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/lib/auth";
import { getFileUrl, getUserAvatarUrl, getUserRing } from "@/lib/pb";
import { toastPromise } from "@/lib/toast-promise";

import { PostData, useDeletePostMutation, usePostLikeMutation } from "../-data";
import { formatRelativeTime } from "../-utils";
import type { ViewerImage } from "./image-viewer";
import { InstagramCarousel, MomentsImageGrid } from "./post-images";

type PostProps = PostData & {
    onOpenComments: () => void;
    onOpenImage: (images: ViewerImage[], index: number) => void;
    onEdit: () => void;
};

export default function Post({
    id,
    author,
    text,
    createdAt,
    metrics,
    liked,
    layout,
    collectionId,
    images,
    onOpenComments,
    onOpenImage,
    onEdit,
}: PostProps) {
    const user = useCurrentUser();
    const likeMutation = usePostLikeMutation();
    const deleteMutation = useDeletePostMutation();
    const isMine = author.id === user.id;

    // Files are protected: build the URLs with the current file token each
    // time, instead of baking a soon-to-expire token into the query cache.
    const fileRecord = { id, collectionId };
    const gridImages = images.map((image) => ({
        name: image.name,
        thumbUrl: getFileUrl(fileRecord, image.name, "600x600"),
        mediumUrl: getFileUrl(fileRecord, image.name, "1200x1200"),
    }));
    const openImage = (index: number) => {
        onOpenImage(
            images.map((image) => ({
                name: image.name,
                url: getFileUrl(fileRecord, image.name),
            })),
            index,
        );
    };

    const avatar = (
        <TouXiang
            className="shrink-0"
            {...getUserRing(author)}
            size={40}
            touXiangUrl={getUserAvatarUrl(author)}
        />
    );

    const actions = (
        <div className="flex items-center gap-3">
            <Button
                type="button"
                variant="ghost"
                className="h-6 gap-1 px-0 text-sm"
                aria-label={liked ? "取消点赞" : "点赞"}
                onClick={() =>
                    likeMutation.mutate({ postId: id, like: !liked })
                }
            >
                {liked ? (
                    <HeartFill className="size-4 text-red-500" />
                ) : (
                    <Heart className="size-4" />
                )}
                <span>{metrics.likeCount}</span>
            </Button>
            <Button
                type="button"
                variant="ghost"
                className="h-6 gap-1 px-0 text-sm"
                aria-label="查看评论"
                onClick={onOpenComments}
            >
                <MessageCircle className="size-4" />
                <span>{metrics.replyCount}</span>
            </Button>
        </div>
    );

    // Only the author may edit or delete a post, so only they see the menu.
    const menu = isMine ? (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground"
                    aria-label="更多操作"
                >
                    <Ellipsis className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem
                    className="hover:cursor-pointer"
                    onClick={onEdit}
                >
                    <Pencil className="mr-2 size-4" />
                    <span>编辑</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                    className="text-destructive hover:cursor-pointer hover:bg-destructive/10 hover:!text-destructive"
                    onClick={async () => {
                        try {
                            await toastPromise(
                                deleteMutation.mutateAsync({ id }),
                                {
                                    loading: "删除中...",
                                    success: "已删除帖子",
                                    error: "删除失败",
                                },
                            );
                        } catch {
                            // toastPromise already surfaced the error.
                        }
                    }}
                >
                    <Trash2 className="mr-2 size-4" />
                    <span>删除</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    ) : null;

    if (layout === "instagram") {
        return (
            <article className="mb-3 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft">
                <div className="flex items-center gap-3 px-4 pt-4">
                    {avatar}
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">
                            {author.user_name || "朋友"}
                        </div>
                        <time
                            className="text-xs text-muted-foreground"
                            dateTime={createdAt}
                        >
                            {formatRelativeTime(createdAt)}
                        </time>
                    </div>
                    {menu}
                </div>

                {images.length > 0 && (
                    <div className="mt-3">
                        <InstagramCarousel
                            images={gridImages}
                            onOpen={openImage}
                        />
                    </div>
                )}

                <div className="px-4 pt-3">{actions}</div>

                {text && (
                    <p className="mt-1 whitespace-pre-wrap break-words px-4 pb-4 text-[15px] leading-relaxed">
                        <span className="font-semibold">
                            {author.user_name || "朋友"}
                        </span>{" "}
                        {text}
                    </p>
                )}
            </article>
        );
    }

    return (
        <article className="mb-3 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
            <div className="flex gap-3">
                {avatar}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">
                            {author.user_name || "朋友"}
                        </span>
                        {menu}
                    </div>

                    {text && (
                        <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                            {text}
                        </p>
                    )}

                    <MomentsImageGrid images={gridImages} onOpen={openImage} />

                    <div className="mt-2 flex items-center justify-between gap-2">
                        <time
                            className="text-xs text-muted-foreground"
                            dateTime={createdAt}
                        >
                            {formatRelativeTime(createdAt)}
                        </time>
                        {actions}
                    </div>
                </div>
            </div>
        </article>
    );
}
