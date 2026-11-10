import { ImagePlus, Plus, X } from "lucide-react";

import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { PostLayout } from "@/lib/pb-types";

import { MAX_IMAGES, type PreviewImage } from "./usePostDraft";

type PostComposerImagesProps = {
    images: PreviewImage[];
    showImages: boolean;
    preparing: boolean;
    pendingCount: number;
    layout: PostLayout;
    onPick: () => void;
    onRemove: (index: number) => void;
    onPreview: (index: number) => void;
};

export default function PostComposerImages({
    images,
    showImages,
    preparing,
    pendingCount,
    layout,
    onPick,
    onRemove,
    onPreview,
}: PostComposerImagesProps) {
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
                    照片
                </h3>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                    {images.length > 0
                        ? `${images.length}/${MAX_IMAGES}`
                        : `最多 ${MAX_IMAGES} 张`}
                </span>
            </div>

            {!showImages ? (
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
                            添加照片
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            自动压缩，最多 9 张
                        </span>
                    </span>
                    <Plus className="size-4 shrink-0 text-primary" />
                </button>
            ) : (
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                    {images.map((image, index) => (
                        <div
                            key={image.url}
                            className="relative aspect-square overflow-hidden rounded-2xl bg-muted"
                        >
                            <button
                                type="button"
                                onClick={() => onPreview(index)}
                                aria-label={`预览第 ${index + 1} 张照片`}
                                className="size-full"
                            >
                                <img
                                    src={image.url}
                                    alt=""
                                    className="size-full object-cover"
                                />
                            </button>

                            {layout === "instagram" && index === 0 && (
                                <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                                    封面
                                </span>
                            )}

                            <button
                                type="button"
                                onClick={() => onRemove(index)}
                                aria-label={`移除第 ${index + 1} 张照片`}
                                className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
                            >
                                <X className="size-3.5" />
                            </button>
                        </div>
                    ))}

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

                    {images.length < MAX_IMAGES && !preparing && (
                        <button
                            type="button"
                            onClick={onPick}
                            aria-label="继续添加照片"
                            className="grid aspect-square place-items-center rounded-2xl border border-dashed border-input bg-muted/40 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                        >
                            <Plus className="size-6" />
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
