import {
    Loader2,
    Maximize2,
    Pause,
    Play,
    VideoOff,
    Volume2,
    VolumeX,
} from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";

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
    /**
     * Intrinsic size recorded at upload, so the first frame already reserves
     * the real box instead of starting at 16:9 and jumping on metadata.
     */
    videoWidth?: number;
    videoHeight?: number;
    onOpenFullscreen: () => void;
    /**
     * Fill the parent's box instead of drawing one. The tweet media pair and
     * the photo strip decide each slide's size, so the clip has to obey that
     * box (letterboxed by `object-contain`) instead of sizing itself.
     */
    tile?: boolean;
    /**
     * Reports the clip's display ratio once metadata is known, so a slide box
     * can follow it when the post predates `media_meta`.
     */
    onAspect?: (ratio: number) => void;
};

/** Extreme portrait clips are capped so one post cannot fill the whole feed. */
const MAX_HEIGHT = "75dvh";

/** How much of the clip must be on screen before it silently starts. */
const AUTOPLAY_VISIBLE_RATIO = 0.6;

/**
 * A single post video.
 *
 * The tweet layout follows x.com's phone player: the first frame fills the
 * text column with a 16px radius, and once most of it is on screen it starts
 * muted, pausing again when it scrolls away. While it plays X shows only the
 * elapsed time and a mute toggle, so tapping the video (or the idle play
 * overlay) opens the full-screen viewer, which owns the real player chrome.
 * `prefers-reduced-motion` users never get the silent autoplay.
 *
 * The other layouts keep tap-to-play and the compact control bar
 * (play/pause, seek, mute, fullscreen). Native chrome is inconsistent across
 * Android/iOS, oversized on a phone, and its fullscreen button collided with
 * our own overlay; the custom bar keeps the video clean and leaves the
 * dedicated fullscreen viewer in charge.
 *
 * The box follows the clip's intrinsic aspect ratio (once metadata is known)
 * instead of forcing 16:9: a phone recording is usually portrait, and drawing
 * it in a wide box left it as a narrow pillar between two huge black bars.
 * Ratios are clamped to 2:5..16:9 and the height to 75dvh; `object-contain`
 * keeps the rest readable without ever cropping.
 *
 * In a mixed photo+video post the row/strip owns the slide size instead, so
 * the caller passes `tile`: the clip fills that box (letterboxed when the
 * shapes differ) and its overlays shrink to fit a narrow column.
 */
export default function PostVideo({
    url,
    layout,
    videoWidth,
    videoHeight,
    onOpenFullscreen,
    tile = false,
    onAspect,
}: PostVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [started, setStarted] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [ended, setEnded] = useState(false);
    const [inView, setInView] = useState(false);
    const [muted, setMuted] = useState(layout === "twitter");
    const [failed, setFailed] = useState(false);
    const [ready, setReady] = useState(false);
    const [ratio, setRatio] = useState(() =>
        videoWidth && videoHeight
            ? videoDisplayRatio(videoWidth, videoHeight)
            : DEFAULT_VIDEO_RATIO,
    );
    const [duration, setDuration] = useState<number | null>(null);
    const [currentTime, setCurrentTime] = useState(0);

    const isTweet = layout === "twitter";
    const showPlayOverlay = !failed && (!started || ended);

    const durationLabel =
        duration === null ? "" : formatVideoDuration(duration);
    const currentLabel =
        currentTime > 0 ? formatVideoDuration(currentTime) : "0:00";

    // A post opened from the cache keeps its stored size; follow it if the
    // clip is replaced while editing. Real metadata still wins over both.
    useEffect(() => {
        if (videoWidth && videoHeight) {
            setRatio(videoDisplayRatio(videoWidth, videoHeight));
        }
    }, [videoWidth, videoHeight]);

    // Watch the video itself, not the card: the feed scrolls inside `_main`,
    // and viewport intersection is what X's "play when visible" means.
    useEffect(() => {
        if (!isTweet) return;
        const node = videoRef.current;
        if (!node) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
        }
        const observer = new IntersectionObserver(
            ([entry]) => {
                setInView(
                    Boolean(entry?.isIntersecting) &&
                        entry.intersectionRatio >= AUTOPLAY_VISIBLE_RATIO,
                );
            },
            { threshold: [0, AUTOPLAY_VISIBLE_RATIO] },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [isTweet]);

    // X autoplays muted in the timeline. Muting right before play() is what
    // keeps the browser's autoplay policy happy; when the clip leaves the
    // viewport it pauses, and it never restarts itself after it ended.
    useEffect(() => {
        if (!isTweet) return;
        const video = videoRef.current;
        if (!video || failed) return;
        if (inView && !ended) {
            if (!video.muted) {
                video.muted = true;
                setMuted(true);
            }
            void video.play().catch(() => undefined);
        } else if (!video.paused) {
            video.pause();
        }
    }, [inView, ended, failed, isTweet]);

    // A backgrounded tab should not keep playing a muted clip.
    useEffect(() => {
        if (!isTweet) return;
        const handleVisibility = () => {
            const video = videoRef.current;
            if (!video) return;
            if (document.hidden) {
                video.pause();
            } else if (inView && !ended) {
                void video.play().catch(() => undefined);
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);
        return () =>
            document.removeEventListener("visibilitychange", handleVisibility);
    }, [inView, ended, isTweet]);

    const handleLoadedMetadata = () => {
        const video = videoRef.current;
        if (!video) return;
        const next = videoDisplayRatio(video.videoWidth, video.videoHeight);
        setRatio(next);
        onAspect?.(next);
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
            setEnded(false);
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
        // Keep a muted timeline clip running behind the full-screen viewer so
        // closing it lands back on a playing video, as X's feed does. Two
        // unmuted players would double the audio, so mute first; the other
        // layouts pause whatever they were playing.
        const video = videoRef.current;
        if (video) {
            if (isTweet) {
                if (!video.muted) {
                    video.muted = true;
                    setMuted(true);
                }
            } else {
                video.pause();
            }
        }
        onOpenFullscreen();
    };

    const retry = () => {
        setFailed(false);
        setStarted(false);
        setPlaying(false);
        setEnded(false);
        setCurrentTime(0);
        videoRef.current?.load();
    };

    return (
        <div
            className={cn(
                "relative overflow-hidden bg-black",
                tile ? "size-full" : "w-full",
                isTweet && !tile && "rounded-[16px]",
            )}
            // Inline because the ratio is runtime data. Keep the video element
            // inside `object-contain`: when the ratio or the height cap clamps,
            // bars are preferable to cropping the clip. A tile is sized by the
            // row/strip it sits in, so it must not set a box of its own.
            style={
                tile
                    ? undefined
                    : { aspectRatio: String(ratio), maxHeight: MAX_HEIGHT }
            }
        >
            <video
                ref={videoRef}
                src={videoFirstFrameUrl(url)}
                preload="metadata"
                playsInline
                aria-label="动态视频"
                className="size-full bg-black object-contain"
                onClick={() => {
                    if (isTweet) return;
                    if (started) void togglePlay();
                }}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={(event) =>
                    setCurrentTime(event.currentTarget.currentTime)
                }
                onPlay={() => {
                    setStarted(true);
                    setPlaying(true);
                    setEnded(false);
                }}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                    setPlaying(false);
                    setEnded(true);
                }}
                onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
                onError={() => setFailed(true)}
            />

            {showPlayOverlay && (
                <>
                    <button
                        type="button"
                        onClick={() => {
                            // A finished clip replays in place; an untouched
                            // one opens the viewer, as tapping does on X.
                            if (isTweet && started) {
                                const video = videoRef.current;
                                if (video) video.currentTime = 0;
                                setEnded(false);
                                void play();
                                return;
                            }
                            if (isTweet) openFullscreen();
                            else void play();
                        }}
                        aria-label={
                            isTweet && started
                                ? "重新播放视频"
                                : isTweet
                                  ? "打开视频"
                                  : "播放视频"
                        }
                        className={cn(
                            "absolute inset-0 grid place-items-center",
                            !isTweet &&
                                "bg-linear-to-t from-black/45 via-black/5 to-black/20",
                        )}
                    >
                        <span
                            className={cn(
                                "grid place-items-center rounded-full bg-black/45 text-white shadow-xl ring-1 ring-white/30 backdrop-blur-sm transition-transform active:scale-95",
                                tile ? "size-10" : "size-16",
                            )}
                        >
                            <Play
                                className={cn(
                                    "ml-0.5 fill-current drop-shadow-sm",
                                    tile ? "size-4" : "size-7",
                                )}
                            />
                        </span>
                    </button>

                    {!ready && (
                        <span
                            data-video-loading
                            className={cn(
                                "pointer-events-none absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/55 text-[11px] font-medium text-white backdrop-blur-sm",
                                tile ? "p-1" : "px-2 py-1",
                            )}
                        >
                            <Loader2
                                className="size-3 animate-spin"
                                aria-hidden="true"
                            />
                            {!tile && "加载中"}
                        </span>
                    )}

                    {durationLabel && (
                        <span
                            data-duration-badge
                            className={cn(
                                "pointer-events-none absolute text-white",
                                tile
                                    ? "bottom-1.5 left-1.5 rounded-[3px] bg-black/75 px-1 py-0.5 text-[11px] leading-4 tabular-nums"
                                    : isTweet
                                      ? "bottom-2 left-2 rounded-[4px] bg-black/75 px-1.5 py-0.5 text-[13px] leading-4 font-normal tabular-nums"
                                      : "bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm",
                            )}
                        >
                            {durationLabel}
                        </span>
                    )}
                </>
            )}

            {isTweet && started && !failed && (
                <>
                    {!showPlayOverlay && (
                        <button
                            type="button"
                            onClick={openFullscreen}
                            aria-label="打开视频"
                            className="absolute inset-0 z-[1]"
                        />
                    )}

                    <div
                        className={cn(
                            "pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent",
                            tile ? "h-8" : "h-14",
                        )}
                    />

                    <span
                        data-duration-badge
                        className={cn(
                            "pointer-events-none absolute rounded-[4px] bg-black/75 px-1.5 py-0.5 text-[13px] leading-4 text-white tabular-nums",
                            tile
                                ? "bottom-1.5 left-1.5 px-1 text-[11px]"
                                : "bottom-3 left-3",
                        )}
                    >
                        {playing && !ended ? currentLabel : durationLabel}
                    </span>

                    <button
                        type="button"
                        onClick={toggleMute}
                        aria-label={muted ? "取消静音" : "静音"}
                        data-testid="mute-button"
                        className={cn(
                            "absolute z-10 grid place-items-center text-white",
                            tile
                                ? "right-1 bottom-1 size-8"
                                : "right-3 bottom-3 size-10",
                        )}
                    >
                        <span
                            className={cn(
                                "grid place-items-center rounded-full bg-black/75",
                                tile ? "size-5" : "size-6",
                            )}
                        >
                            {muted ? (
                                <VolumeX className="size-3" />
                            ) : (
                                <Volume2 className="size-3" />
                            )}
                        </span>
                    </button>
                </>
            )}

            {!isTweet && started && !failed && (
                <div className="absolute inset-x-0 bottom-0 z-10 animate-in bg-linear-to-t from-black/85 via-black/45 to-transparent px-3 pt-10 pb-2.5 fade-in-0">
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
                        <span className="w-9 shrink-0 text-center text-[11px] font-medium text-white/90 tabular-nums">
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
                        <span className="w-9 shrink-0 text-center text-[11px] font-medium text-white/90 tabular-nums">
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
                <div
                    className={cn(
                        "absolute inset-0 grid place-items-center bg-black/70 text-center text-white",
                        tile ? "px-1" : "px-6",
                    )}
                >
                    <div>
                        <VideoOff
                            className={cn(
                                "mx-auto opacity-80",
                                tile ? "size-5" : "size-7",
                            )}
                        />
                        {/* A tile can be a 55px column: the hint would wrap
                            into unreadable slivers, so only the icon and the
                            retry stay. */}
                        {!tile && (
                            <p className="mt-2 text-xs text-white/85">
                                视频加载失败，换个浏览器或网络试试
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={retry}
                            className={cn(
                                "rounded-full bg-white/15 font-medium active:bg-white/30",
                                tile
                                    ? "mt-1 px-2 py-0.5 text-[10px]"
                                    : "mt-3 px-4 py-1.5 text-xs",
                            )}
                        >
                            重试
                        </button>
                    </div>
                </div>
            )}

            {!failed && !started && !isTweet && (
                <button
                    type="button"
                    onClick={openFullscreen}
                    aria-label="全屏播放视频"
                    className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-black/55 text-white shadow-xs backdrop-blur-sm transition-colors hover:bg-black/75 active:bg-black/75"
                >
                    <Maximize2 className="size-4" />
                </button>
            )}
        </div>
    );
}
