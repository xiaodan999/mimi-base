import { useRef, useState } from "react";
import { Loader2, Maximize2, Play, VideoOff } from "lucide-react";

import type { PostLayout } from "@/lib/pb-types";
import {
    DEFAULT_VIDEO_RATIO,
    formatVideoDuration,
    videoDisplayRatio,
    videoFirstFrameUrl,
} from "@/lib/postMedia";
import { cn } from "@/lib/utils";

type PostVideoProps = {
    /** Protected file URL, already carrying the short-lived token. */
    url: string;
    layout: PostLayout;
    onOpenFullscreen: () => void;
};

/** Extreme portrait clips are capped so one post cannot fill the whole feed. */
const MAX_HEIGHT = "75dvh";

/**
 * A single post video. Nothing autoplays: the first frame comes from
 * `preload="metadata"` plus a media fragment, and the big play button is the
 * only way sound starts, so `prefers-reduced-motion` needs no special case.
 *
 * The box follows the clip's intrinsic aspect ratio (once metadata is known)
 * instead of forcing 16:9: a phone recording is usually portrait, and drawing
 * it in a wide box left it as a narrow pillar between two huge black bars.
 * Ratios are clamped to 9:16..16:9 and the height to 75dvh; `object-contain`
 * keeps the rest readable without ever cropping.
 *
 * Native controls are switched on after the first play. The full-screen
 * button is our own overlay (not the native one) so the video can be enlarged
 * without the browser's gesture-heavy player chrome on a phone.
 */
export default function PostVideo({
    url,
    layout,
    onOpenFullscreen,
}: PostVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [started, setStarted] = useState(false);
    const [failed, setFailed] = useState(false);
    const [ready, setReady] = useState(false);
    const [ratio, setRatio] = useState(DEFAULT_VIDEO_RATIO);
    const [duration, setDuration] = useState<number | null>(null);

    const durationLabel =
        duration === null ? "" : formatVideoDuration(duration);

    const handleLoadedMetadata = () => {
        const video = videoRef.current;
        if (!video) return;
        setRatio(videoDisplayRatio(video.videoWidth, video.videoHeight));
        setDuration(Number.isFinite(video.duration) ? video.duration : null);
        setReady(true);
    };

    const play = async () => {
        const video = videoRef.current;
        if (!video) return;
        setFailed(false);
        try {
            await video.play();
            setStarted(true);
        } catch {
            // Autoplay policy or an unsupported codec; leave the player with
            // its native controls so the user can try again.
            setStarted(true);
        }
    };

    const openFullscreen = () => {
        videoRef.current?.pause();
        onOpenFullscreen();
    };

    return (
        <div
            className={cn(
                "relative overflow-hidden bg-black",
                layout === "moments"
                    ? "mt-3 w-full max-w-[320px] rounded-xl"
                    : "w-full",
            )}
            // Inline because the ratio is runtime data. Keep the video element
            // inside `object-contain`: when the ratio or the height cap clamps,
            // bars are preferable to cropping the clip.
            style={{ aspectRatio: String(ratio), maxHeight: MAX_HEIGHT }}
        >
            <video
                ref={videoRef}
                src={videoFirstFrameUrl(url)}
                preload="metadata"
                playsInline
                controls={started}
                aria-label="动态视频"
                className="size-full bg-black object-contain"
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setStarted(true)}
                onError={() => setFailed(true)}
            />

            {!started && !failed && (
                <>
                    <button
                        type="button"
                        onClick={() => void play()}
                        aria-label="播放视频"
                        className="absolute inset-0 grid place-items-center bg-gradient-to-t from-black/45 via-black/5 to-black/20"
                    >
                        <span className="grid size-16 place-items-center rounded-full bg-black/45 text-white shadow-xl ring-1 ring-white/30 backdrop-blur-sm transition-transform active:scale-95">
                            <Play className="ml-0.5 size-7 fill-current drop-shadow" />
                        </span>
                    </button>

                    {!ready && (
                        <span
                            data-video-loading
                            className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm"
                        >
                            <Loader2
                                className="size-3 animate-spin"
                                aria-hidden="true"
                            />
                            加载中
                        </span>
                    )}

                    {durationLabel && (
                        <span
                            data-duration-badge
                            className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm"
                        >
                            {durationLabel}
                        </span>
                    )}
                </>
            )}

            {failed && (
                <div className="absolute inset-0 grid place-items-center bg-black/70 px-6 text-center text-white">
                    <div>
                        <VideoOff className="mx-auto size-7 opacity-80" />
                        <p className="mt-2 text-xs text-white/85">
                            视频加载失败，换个浏览器或网络试试
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                setFailed(false);
                                videoRef.current?.load();
                            }}
                            className="mt-3 rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium active:bg-white/30"
                        >
                            重试
                        </button>
                    </div>
                </div>
            )}

            {!failed && (
                <button
                    type="button"
                    onClick={openFullscreen}
                    aria-label="全屏播放视频"
                    className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/75 active:bg-black/75"
                >
                    <Maximize2 className="size-4" />
                </button>
            )}
        </div>
    );
}
