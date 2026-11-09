import { useRef, useState, type ChangeEvent } from "react";
import {
    Loader2,
    Maximize2,
    Pause,
    Play,
    VideoOff,
    Volume2,
    VolumeX,
} from "lucide-react";

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
 * After the first play we use a compact control bar (play/pause, seek, mute,
 * fullscreen) instead of the browser's native chrome. Native controls are
 * inconsistent across Android/iOS, oversized on a phone, and their fullscreen
 * button collided with our own overlay; the custom bar keeps the video clean
 * and leaves the dedicated fullscreen viewer in charge.
 */
export default function PostVideo({
    url,
    layout,
    onOpenFullscreen,
}: PostVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [started, setStarted] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [failed, setFailed] = useState(false);
    const [ready, setReady] = useState(false);
    const [ratio, setRatio] = useState(DEFAULT_VIDEO_RATIO);
    const [duration, setDuration] = useState<number | null>(null);
    const [currentTime, setCurrentTime] = useState(0);

    const durationLabel =
        duration === null ? "" : formatVideoDuration(duration);
    const currentLabel =
        currentTime > 0 ? formatVideoDuration(currentTime) : "0:00";

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
            // Autoplay policy or an unsupported codec; keep the custom bar
            // visible so the user can try again.
            setStarted(true);
        }
    };

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused || video.ended) {
            if (video.ended) video.currentTime = 0;
            void play();
        } else {
            video.pause();
        }
    };

    const seek = (event: ChangeEvent<HTMLInputElement>) => {
        const next = Number(event.currentTarget.value);
        const video = videoRef.current;
        if (video) video.currentTime = next;
        setCurrentTime(next);
    };

    const toggleMute = () => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = !video.muted;
        setMuted(video.muted);
    };

    const openFullscreen = () => {
        videoRef.current?.pause();
        onOpenFullscreen();
    };

    const retry = () => {
        setFailed(false);
        setStarted(false);
        setPlaying(false);
        setCurrentTime(0);
        videoRef.current?.load();
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
                aria-label="动态视频"
                className="size-full bg-black object-contain"
                onClick={() => {
                    if (started) void togglePlay();
                }}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={(event) =>
                    setCurrentTime(event.currentTarget.currentTime)
                }
                onPlay={() => {
                    setStarted(true);
                    setPlaying(true);
                }}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
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

            {started && !failed && (
                <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-2.5 pt-10 animate-in fade-in-0">
                    <div className="flex items-center gap-1.5 text-white">
                        <button
                            type="button"
                            onClick={togglePlay}
                            aria-label={playing ? "暂停视频" : "播放视频"}
                            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 active:bg-white/30"
                        >
                            {playing ? (
                                <Pause className="size-4 fill-current" />
                            ) : (
                                <Play className="ml-0.5 size-4 fill-current" />
                            )}
                        </button>
                        <span className="w-9 shrink-0 text-center text-[11px] font-medium tabular-nums text-white/90">
                            {currentLabel}
                        </span>
                        <input
                            type="range"
                            min={0}
                            max={duration ?? 0}
                            step={0.1}
                            value={Math.min(currentTime, duration ?? 0)}
                            onChange={seek}
                            disabled={duration === null}
                            aria-label="视频进度"
                            aria-valuetext={`${currentLabel} / ${durationLabel || "未知"}`}
                            className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/30 accent-white disabled:opacity-50"
                        />
                        <span className="w-9 shrink-0 text-center text-[11px] font-medium tabular-nums text-white/90">
                            {durationLabel || "--:--"}
                        </span>
                        <button
                            type="button"
                            onClick={toggleMute}
                            aria-label={muted ? "取消静音" : "静音"}
                            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 active:bg-white/30"
                        >
                            {muted ? (
                                <VolumeX className="size-4" />
                            ) : (
                                <Volume2 className="size-4" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={openFullscreen}
                            aria-label="全屏播放视频"
                            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 active:bg-white/30"
                        >
                            <Maximize2 className="size-4" />
                        </button>
                    </div>
                </div>
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
                            onClick={retry}
                            className="mt-3 rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium active:bg-white/30"
                        >
                            重试
                        </button>
                    </div>
                </div>
            )}

            {!failed && !started && (
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
