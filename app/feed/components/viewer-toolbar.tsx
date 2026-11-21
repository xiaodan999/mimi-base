import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
    visible: boolean;
    current: number;
    total: number;
    onClose: () => void;
    onPrev: () => void;
    onNext: () => void;
};

/** Close button, counter and desktop arrows over the image. */
export default function ViewerToolbar({
    visible,
    current,
    total,
    onClose,
    onPrev,
    onNext,
}: Props) {
    return (
        <div
            className={cn(
                "pointer-events-none absolute inset-0 z-10 transition-opacity duration-200",
                visible ? "opacity-100" : "invisible opacity-0",
            )}
        >
            <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="pointer-events-auto absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 rounded-full bg-white/15 p-2 active:bg-white/30"
            >
                <X className="size-5" />
            </button>

            {total > 1 && (
                <span className="absolute top-[calc(1rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 text-sm text-white/80">
                    {current + 1}/{total}
                </span>
            )}

            {total > 1 && current > 0 && (
                <button
                    type="button"
                    onClick={onPrev}
                    aria-label="上一张"
                    className="pointer-events-auto absolute top-1/2 left-2 hidden -translate-y-1/2 rounded-full bg-white/15 p-2 active:bg-white/30 sm:block"
                >
                    <ChevronLeft className="size-5" />
                </button>
            )}
            {total > 1 && current < total - 1 && (
                <button
                    type="button"
                    onClick={onNext}
                    aria-label="下一张"
                    className="pointer-events-auto absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-full bg-white/15 p-2 active:bg-white/30 sm:block"
                >
                    <ChevronRight className="size-5" />
                </button>
            )}
        </div>
    );
}
