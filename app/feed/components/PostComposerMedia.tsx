import { ArrowUpDown, ImagePlus, Play, Plus, X } from "lucide-react";

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
                <div className="mt-2.5 grid grid-cols-3 gap-2">
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
                                className="relative aspect-square overflow-hidden rounded-2xl bg-muted"
                            >
                                {item.type === "image" ? (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onPreviewImage(kindIndex)
                                        }
                                        aria-label={`预览第 ${slot + 1} 个媒体`}
                                        className="size-full"
                                    >
                                        <img
                                            src={item.url}
                                            alt=""
                                            className="size-full object-cover"
                                        />
                                    </button>
                                ) : (
                                    <>
                                        <video
                                            src={videoFirstFrameUrl(item.url)}
                                            muted
                                            playsInline
                                            preload="metadata"
                                            aria-label="视频预览"
                                            className="size-full bg-black object-cover"
                                        />
                                        <span
                                            aria-hidden="true"
                                            className="pointer-events-none absolute inset-0 grid place-items-center"
                                        >
                                            <span className="grid size-9 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/30 backdrop-blur-sm">
                                                <Play className="ml-0.5 size-4 fill-current" />
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onPreviewVideo(item.url)
                                            }
                                            aria-label={`预览第 ${slot + 1} 个媒体`}
                                            className="absolute inset-0 z-[1]"
                                        />
                                        {item.kind === "file" && (
                                            <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/65 px-1 text-[10px] leading-4 text-white tabular-nums">
                                                {item.sizeLabel}
                                            </span>
                                        )}
                                    </>
                                )}

                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute top-1.5 left-1.5 z-[2] grid h-6 min-w-6 place-items-center rounded-full bg-black/65 px-1.5 text-[10px] font-semibold text-white"
                                >
                                    {cover}
                                </span>

                                <button
                                    type="button"
                                    onClick={() => onRemove(slot)}
                                    aria-label={`移除第 ${slot + 1} 个媒体`}
                                    className="absolute top-1.5 right-1.5 z-[2] grid size-7 place-items-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/80"
                                >
                                    <X className="size-3.5" />
                                </button>
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
                        <button
                            type="button"
                            onClick={onPick}
                            aria-label="继续添加照片或视频"
                            className="grid aspect-square place-items-center rounded-2xl border border-dashed border-input bg-muted/40 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                        >
                            <Plus className="size-6" />
                        </button>
                    )}
                </div>
            )}

            {media.length > 1 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                    点「调整顺序」后，按住任意照片或视频即可拖动排序
                </p>
            )}
        </section>
    );
}
