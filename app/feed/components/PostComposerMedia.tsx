import { ArrowUpDown, ImagePlus, Plus } from "lucide-react";

import { MediaAddTile, MediaGrid, MediaTile } from "@/components/MediaGrid";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { PostLayout } from "@/lib/pb-types";
import { MAX_POST_MEDIA, videoFirstFrameUrl } from "@/lib/postMedia";

import { indexMediaByKind } from "../utils";
import type { PreviewMedia } from "./usePostDraft";

type PostComposerMediaProps = {
    media: PreviewMedia[];
    preparing: boolean;
    pendingCount: number;
    layout: PostLayout;
    onPick: () => void;
    onRemove: (index: number) => void;
    onSort: () => void;
    /** Open the image viewer at this photo's index among the photos. */
    onPreviewImage: (imageIndex: number) => void;
    /** Open the full-screen video player for this draft's object/protected URL. */
    onPreviewVideo: (url: string) => void;
};

/**
 * One media section for the composer: photos and videos share the picker, the
 * count and the sortable grid, so a post's visual order can mix both kinds.
 */
export default function PostComposerMedia({
    media,
    preparing,
    pendingCount,
    layout,
    onPick,
    onRemove,
    onSort,
    onPreviewImage,
    onPreviewVideo,
}: PostComposerMediaProps) {
    const indexed = indexMediaByKind(media);

    return (
        <section
            className="mt-3 border-t border-border/60 pt-4"
            aria-labelledby="new-post-media"
        >
            <div className="flex items-baseline justify-between">
                <h3
                    id="new-post-media"
                    className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground"
                >
                    媒体
                </h3>
                <span className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                    {media.length > 1 && (
                        <button
                            type="button"
                            onClick={onSort}
                            className="flex items-center gap-1 rounded-full px-2 py-1 font-medium text-primary active:bg-primary/10"
                        >
                            <ArrowUpDown className="size-3" />
                            调整顺序
                        </button>
                    )}
                    <span>
                        {media.length > 0
                            ? `${media.length}/${MAX_POST_MEDIA}`
                            : `最多 ${MAX_POST_MEDIA} 个`}
                    </span>
                </span>
            </div>

            {media.length === 0 && !preparing ? (
                <button
                    type="button"
                    onClick={onPick}
                    className="mt-2.5 flex w-full items-center gap-3 rounded-2xl border border-dashed border-primary/35 bg-primary/[0.05] px-3.5 py-3.5 text-left transition-all duration-150 hover:bg-primary/[0.08] active:scale-[0.995]"
                >
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                        <ImagePlus className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                            添加照片或视频
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            图片自动压缩，视频最大 50MB
                        </span>
                    </span>
                    <Plus className="size-4 shrink-0 text-primary" />
                </button>
            ) : (
                <MediaGrid className="mt-2.5">
                    {indexed.map(({ item, index: kindIndex }, slot) => {
                        const cover =
                            layout === "instagram" && slot === 0
                                ? "封面"
                                : String(slot + 1);
                        return (
                            <div
                                key={item.url}
                                data-media-slot={slot}
                                data-media-kind={item.type}
                            >
                                <MediaTile
                                    className="rounded-2xl"
                                    media={
                                        item.type === "image"
                                            ? { type: "image", src: item.url }
                                            : {
                                                  type: "video",
                                                  src: videoFirstFrameUrl(
                                                      item.url,
                                                  ),
                                              }
                                    }
                                    badge={cover}
                                    caption={
                                        item.type === "video" &&
                                        item.kind === "file"
                                            ? item.sizeLabel
                                            : undefined
                                    }
                                    onOpen={() =>
                                        item.type === "image"
                                            ? onPreviewImage(kindIndex)
                                            : onPreviewVideo(item.url)
                                    }
                                    openLabel={`预览第 ${slot + 1} 个媒体`}
                                    onRemove={() => onRemove(slot)}
                                    removeLabel={`移除第 ${slot + 1} 个媒体`}
                                />
                            </div>
                        );
                    })}

                    {preparing &&
                        Array.from({ length: pendingCount }).map((_, index) => (
                            <div
                                key={`pending-${index}`}
                                aria-hidden="true"
                                className="grid aspect-square animate-pulse place-items-center rounded-2xl bg-muted"
                            >
                                <LoadingSpinner
                                    size={16}
                                    className="text-muted-foreground"
                                />
                            </div>
                        ))}

                    {media.length < MAX_POST_MEDIA && !preparing && (
                        <MediaAddTile
                            className="rounded-2xl"
                            disabled={preparing}
                            label="继续添加照片或视频"
                            onClick={onPick}
                        />
                    )}
                </MediaGrid>
            )}

            {media.length > 1 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                    点「调整顺序」后，按住任意照片或视频即可拖动排序
                </p>
            )}
        </section>
    );
}
