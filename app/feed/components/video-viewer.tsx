import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";

type VideoViewerProps = {
    url: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/**
 * Full-screen video. Opening is an explicit tap on the feed's expand button,
 * so it may start playing immediately; the feed itself never autoplays. The
 * shared `Dialog` wrapper makes the phone back gesture close this overlay.
 */
export default function VideoViewer({
    url,
    open,
    onOpenChange,
}: VideoViewerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (!open) return;
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = 0;
        // The click that opened the viewer is the user gesture; if the
        // browser still blocks it, the native controls remain usable.
        void video.play().catch(() => undefined);
    }, [open, url]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                overlayClassName="bg-black/95"
                showCloseButton={false}
                className="flex h-[100dvh] w-screen max-w-none animate-none! items-center justify-center rounded-none border-0 bg-black p-0 text-white data-[state=closed]:!animate-none data-[state=open]:!animate-none"
            >
                <DialogTitle className="sr-only">播放视频</DialogTitle>
                <DialogDescription className="sr-only">
                    使用播放器控件暂停或调节声音，点右上角关闭
                </DialogDescription>

                <video
                    ref={videoRef}
                    src={url}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[100dvh] max-w-full bg-black"
                />

                <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    aria-label="关闭视频"
                    className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 z-10 rounded-full bg-white/15 p-2 text-white active:bg-white/30"
                >
                    <X className="size-5" />
                </button>
            </DialogContent>
        </Dialog>
    );
}
