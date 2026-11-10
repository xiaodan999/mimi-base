import { Plus, Video, X } from "lucide-react";

import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { videoFirstFrameUrl } from "@/lib/postMedia";

import type { PreviewVideo } from "./usePostDraft";

type PostComposerVideoProps = {
    video: PreviewVideo | null;
    /** Disabled while photos are being compressed. */
    preparing: boolean;
    onPick: () => void;
    onRemove: () => void;
};

/**
 * One optional video per post. The preview plays locally (object URL) before
 * publish, or streams the already-uploaded file (tokened URL) when editing.
 */
export default function PostComposerVideo({
    video,
    preparing,
    onPick,
    onRemove,
}: PostComposerVideoProps) {
    return (
        <section
            className="mt-3 border-t border-border/60 pt-4"
            aria-labelledby="new-post-video"
        >
            <div className="flex items-baseline justify-between">
                <h3
                    id="new-post-video"
                    className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground"
                >
                    视频
                </h3>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                    {video ? "1/1" : "MP4 / WebM / MOV，最大 50MB"}
                </span>
            </div>

            {video ? (
                <div className="relative mt-2.5 overflow-hidden rounded-2xl border border-border/60 bg-black">
                    <video
                        src={
                            video.kind === "file"
                                ? video.url
                                : videoFirstFrameUrl(video.url)
                        }
                        controls
                        muted
                        playsInline
                        preload="metadata"
                        aria-label="视频预览"
                        className="aspect-video w-full bg-black object-contain"
                    />
                    <button
                        type="button"
                        onClick={onRemove}
                        aria-label="移除视频"
                        className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 active:bg-black/80"
                    >
                        <X className="size-4" />
                    </button>
                    <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                        <Video className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">
                            {video.name}
                        </span>
                        <span className="shrink-0 tabular-nums">
                            {video.kind === "file" ? video.sizeLabel : "已上传"}
                        </span>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={onPick}
                    disabled={preparing}
                    className="mt-2.5 flex w-full items-center gap-3 rounded-2xl border border-dashed border-primary/35 bg-primary/[0.05] px-3.5 py-3.5 text-left transition-all duration-150 hover:bg-primary/[0.08] active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                        {preparing ? (
                            <LoadingSpinner size={16} />
                        ) : (
                            <Video className="size-5" />
                        )}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                            添加视频
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            大视频会自动压缩
                        </span>
                    </span>
                    <Plus className="size-4 shrink-0 text-primary" />
                </button>
            )}
        </section>
    );
}
