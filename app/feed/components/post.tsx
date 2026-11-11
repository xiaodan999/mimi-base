import { Ellipsis, Heart, MessageCircle, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/lib/auth";
import { getFileUrl } from "@/lib/pb";
import { toastPromise } from "@/lib/toast-promise";
import { cn } from "@/lib/utils";

import { PostData, useDeletePostMutation, usePostLikeMutation } from "../data";
import { formatRelativeTime } from "../utils";
import AvatarPreview from "./avatar-preview";
import type { ViewerImage } from "./image-viewer";
import {
    InstagramCarousel,
    type PostMediaView,
    TwitterMedia,
} from "./post-images";
import PostVideo from "./post-video";
import { TweetText } from "./tweet-text";

type PostProps = PostData & {
    onOpenComments: () => void;
    onOpenImage: (images: ViewerImage[], index: number) => void;
    onOpenVideo: (url: string) => void;
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
    media,
    onOpenComments,
    onOpenImage,
    onOpenVideo,
    onEdit,
}: PostProps) {
    const user = useCurrentUser();
    const likeMutation = usePostLikeMutation();
    const deleteMutation = useDeletePostMutation();
    const isMine = author.id === user.id;

    // Files are protected: build the URLs with the current file token each
    // time, instead of baking a soon-to-expire token into the query cache.
    const fileRecord = { id, collectionId };
    const mediaViews: PostMediaView[] = media.map((item) =>
        item.kind === "image"
            ? {
                  type: "image",
                  name: item.name,
                  url: getFileUrl(fileRecord, item.name),
                  // PocketBase can only write PNG thumbnails, which come out
                  // larger than the original WebP. The 600px WebP preview is
                  // uploaded by the composer; posts from before that simply
                  // reuse the full image.
                  thumbUrl: getFileUrl(fileRecord, item.thumb ?? item.name),
                  // Recorded at upload time so the feed can reserve the real
                  // box before the protected file loads (old posts have none
                  // and measure on load).
                  width: item.width,
                  height: item.height,
              }
            : {
                  type: "video",
                  name: item.name,
                  url: getFileUrl(fileRecord, item.name),
                  width: item.width,
                  height: item.height,
              },
    );
    const viewerImages = media.flatMap((item) =>
        item.kind === "image"
            ? [{ name: item.name, url: getFileUrl(fileRecord, item.name) }]
            : [],
    );
    const openImage = (index: number) => onOpenImage(viewerImages, index);
    const openVideo = (index: number) => {
        const item = mediaViews.filter((view) => view.type === "video")[index];
        if (item) onOpenVideo(item.url);
    };
    // A lone clip keeps the pre-#80 full-size player in the 大图 layout. The
    // carousel exists for a mixed set; a square slide would letterbox a
    // portrait recording that used to fill the width.
    const onlyVideo =
        mediaViews.length === 1 && mediaViews[0]?.type === "video"
            ? mediaViews[0]
            : null;

    const avatar = <AvatarPreview size={40} user={author} />;

    const actions = (
        <div className="flex items-center gap-3">
            <Button
                type="button"
                variant="ghost"
                className="h-6 gap-1 px-0 text-sm"
                aria-label={liked ? "取消点赞" : "点赞"}
                // One request per card at a time: a rapid second tap used to
                // race the first write (and the refetch it triggers).
                disabled={likeMutation.isPending}
                onClick={() =>
                    likeMutation.mutate({ postId: id, like: !liked })
                }
            >
                {/* One icon set for both states: swapping the antd filled
                    heart for the lucide outline changed the glyph size and
                    baseline, so the button visibly jumped when liking. */}
                <Heart
                    aria-hidden="true"
                    className={cn(
                        "size-4",
                        liked && "fill-current text-red-500",
                    )}
                />
                {/* Tabular digits keep 0 -> 1 the same width without
                    reserving a second digit, which left a visible gap before
                    the comment button. */}
                <span className="tabular-nums">{metrics.likeCount}</span>
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
                    className="text-destructive hover:cursor-pointer hover:bg-destructive/10 hover:text-destructive!"
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

    // `toPostData` already folds a media-less post to `twitter`; keep the
    // renderer tolerant so a row that skipped the mapper cannot fall into the
    // full-bleed branch with nothing to display.
    if (layout === "instagram" && mediaViews.length > 0) {
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

                {/* Photos and clips share the carousel, in the stored order;
                    a single clip keeps the full-size player instead. */}
                <div className="mt-3">
                    {onlyVideo ? (
                        <PostVideo
                            url={onlyVideo.url}
                            layout="instagram"
                            videoWidth={onlyVideo.width}
                            videoHeight={onlyVideo.height}
                            onOpenFullscreen={() => openVideo(0)}
                        />
                    ) : (
                        <InstagramCarousel
                            media={mediaViews}
                            onOpenImage={openImage}
                            onOpenVideo={openVideo}
                        />
                    )}
                </div>

                <div className="px-4 pt-3">{actions}</div>

                {text && (
                    <p className="mt-1 px-4 pb-4 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                        <span className="font-semibold">
                            {author.user_name || "朋友"}
                        </span>{" "}
                        {text}
                    </p>
                )}
            </article>
        );
    }

    // Everything else is the compact tweet card; `toPostData` folds the
    // retired moments layout into `twitter`.
    return (
        <article className="mb-3 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
            <div className="flex gap-3">
                {avatar}
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-baseline gap-1.5">
                            <span className="truncate text-sm font-semibold">
                                {author.user_name || "朋友"}
                            </span>
                            <time
                                className="shrink-0 text-xs text-muted-foreground"
                                dateTime={createdAt}
                            >
                                {formatRelativeTime(createdAt)}
                            </time>
                        </div>
                        {menu}
                    </div>

                    {text && <TweetText text={text} />}

                    {/* One ordered media set: a lone clip is still the normal
                        player, everything else follows X's single / pair /
                        strip rules. */}
                    <TwitterMedia
                        media={mediaViews}
                        onOpenImage={openImage}
                        onOpenVideo={openVideo}
                    />

                    {/* X has no divider above the action row. */}
                    <div className="mt-3 flex items-center">{actions}</div>
                </div>
            </div>
        </article>
    );
}
