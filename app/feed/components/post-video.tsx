import { useRef, useState } from "react";
import { Maximize2, Play, VideoOff } from "lucide-react";

import type { PostLayout } from "@/lib/pb-types";
import { videoFirstFrameUrl } from "@/lib/postMedia";
import { cn } from "@/lib/utils";

type PostVideoProps = {
    /** Protected file URL, already carrying the short-lived token. */
    url: string;
    layout: PostLayout;
    onOpenFullscreen: () => void;
};

/**
 * A single post video. Nothing autoplays: the first frame comes from
 * `preload="metadata"` plus a media fragment, and the big play button is the
 * only way sound starts, so `prefers-reduced-motion` needs no special case.
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
        >
            <video
                ref={videoRef}
                src={videoFirstFrameUrl(url)}
                preload="metadata"
                playsInline
                controls={started}
                aria-label="动态视频"
                className="aspect-video w-full bg-black object-contain"
                onPlay={() => setStarted(true)}
                onError={() => setFailed(true)}
            />

            {!started && !failed && (
                <button
                    type="button"
                    onClick={() => void play()}
                    aria-label="播放视频"
                    className="absolute inset-0 grid place-items-center bg-gradient-to-t from-black/25 via-transparent to-black/10"
                >
                    <span className="grid size-14 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition-transform active:scale-95">
                        <Play className="ml-0.5 size-6 fill-current" />
                    </span>
                </button>
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
                    className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 active:bg-black/75"
                >
                    <Maximize2 className="size-4" />
                </button>
            )}
        </div>
    );
}
