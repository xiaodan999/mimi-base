import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";

export type ViewerImage = {
    name: string;
    url: string;
};

type ImageViewerProps = {
    images: ViewerImage[];
    index: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/**
 * Full-screen image viewer. The strip is a native scroll-snap carousel, so
 * swiping works on touch devices and the arrows work on desktop.
 */
export default function ImageViewer({
    images,
    index,
    open,
    onOpenChange,
}: ImageViewerProps) {
    const stripRef = useRef<HTMLDivElement>(null);
    const [current, setCurrent] = useState(index);

    useEffect(() => {
        if (!open) return;
        setCurrent(index);
        // The strip mounts together with the dialog; wait one frame before
        // jumping to the requested image.
        const frame = requestAnimationFrame(() => {
            const strip = stripRef.current;
            if (!strip) return;
            strip.scrollLeft = strip.clientWidth * index;
        });
        return () => cancelAnimationFrame(frame);
    }, [open, index]);

    const goTo = (next: number) => {
        const target = Math.min(Math.max(next, 0), images.length - 1);
        const strip = stripRef.current;
        if (!strip) return;
        strip.scrollTo({
            left: strip.clientWidth * target,
            behavior: "smooth",
        });
        setCurrent(target);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex h-[100dvh] w-screen max-w-none items-center justify-center rounded-none border-0 bg-black p-0 text-white [&>button]:hidden"
                onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") goTo(current - 1);
                    if (event.key === "ArrowRight") goTo(current + 1);
                }}
            >
                <DialogTitle className="sr-only">查看图片</DialogTitle>
                <DialogDescription className="sr-only">
                    左右滑动或使用方向键切换图片
                </DialogDescription>

                <div className="relative h-full w-full">
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        aria-label="关闭"
                        className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-10 rounded-full bg-white/15 p-2 active:bg-white/30"
                    >
                        <X className="size-5" />
                    </button>

                    {images.length > 1 && (
                        <span className="absolute left-1/2 top-[calc(1rem+env(safe-area-inset-top))] z-10 -translate-x-1/2 text-sm text-white/80">
                            {current + 1}/{images.length}
                        </span>
                    )}

                    <div
                        ref={stripRef}
                        onScroll={(event) => {
                            const strip = event.currentTarget;
                            if (!strip.clientWidth) return;
                            setCurrent(
                                Math.round(
                                    strip.scrollLeft / strip.clientWidth,
                                ),
                            );
                        }}
                        className="absolute inset-0 flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                        {images.map((image) => (
                            <div
                                key={image.name}
                                className="flex h-full w-screen shrink-0 snap-center items-center justify-center"
                            >
                                <img
                                    src={image.url}
                                    alt=""
                                    className="max-h-full max-w-full object-contain"
                                />
                            </div>
                        ))}
                    </div>

                    {images.length > 1 && current > 0 && (
                        <button
                            type="button"
                            onClick={() => goTo(current - 1)}
                            aria-label="上一张"
                            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 active:bg-white/30"
                        >
                            <ChevronLeft className="size-5" />
                        </button>
                    )}
                    {images.length > 1 && current < images.length - 1 && (
                        <button
                            type="button"
                            onClick={() => goTo(current + 1)}
                            aria-label="下一张"
                            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 active:bg-white/30"
                        >
                            <ChevronRight className="size-5" />
                        </button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
