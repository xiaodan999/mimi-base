import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, GripVertical, X } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import type { PostLayout } from "@/lib/pb-types";
import { cn } from "@/lib/utils";

import { type SortSlotRect, sortTargetAt } from "../utils";
import type { PreviewImage } from "./usePostDraft";

type PostImageSortProps = {
    images: PreviewImage[];
    layout: PostLayout;
    onMove: (from: number, to: number) => void;
    onClose: () => void;
};

type DragState = {
    pointerId: number;
    index: number;
    startX: number;
    startY: number;
    active: boolean;
    slots: SortSlotRect[];
};

const DRAG_THRESHOLD = 6;

/**
 * Full-screen photo ordering surface.
 *
 * The composer grid only shows small numbered thumbnails; moving order there
 * meant tiny arrow buttons layered over every photo. This view gives each
 * photo a real tile and supports dragging on touch and with a mouse, while
 * keeping the reorder action available from the keyboard (arrow keys), which
 * also keeps it usable for screen readers.
 */
export default function PostImageSort({
    images,
    layout,
    onMove,
    onClose,
}: PostImageSortProps) {
    const gridRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [announcement, setAnnouncement] = useState("");

    const slotRects = (): SortSlotRect[] => {
        const grid = gridRef.current;
        if (!grid) return [];
        return Array.from(
            grid.querySelectorAll<HTMLElement>("[data-sort-slot]"),
        ).flatMap((element) => {
            const index = Number(element.dataset.sortSlot);
            if (!Number.isInteger(index)) return [];
            const rect = element.getBoundingClientRect();
            return [
                {
                    index,
                    left: rect.left,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                },
            ];
        });
    };

    const move = (from: number, to: number) => {
        if (from === to || to < 0 || to >= images.length) return;
        onMove(from, to);
        setAnnouncement(`已移动到第 ${to + 1} 张`);
    };

    const handlePointerDown = (
        event: PointerEvent<HTMLButtonElement>,
        index: number,
    ) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerId: event.pointerId,
            index,
            startX: event.clientX,
            startY: event.clientY,
            active: false,
            slots: slotRects(),
        };
    };

    const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        if (!drag.active) {
            const moved = Math.hypot(
                event.clientX - drag.startX,
                event.clientY - drag.startY,
            );
            if (moved < DRAG_THRESHOLD) return;
            drag.active = true;
            setDragIndex(drag.index);
        }

        const target = sortTargetAt(drag.slots, event.clientX, event.clientY);
        if (target === null || target === drag.index) return;
        onMove(drag.index, target);
        setAnnouncement(`已移动到第 ${target + 1} 张`);
        drag.index = target;
        setDragIndex(target);
    };

    const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        setDragIndex(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const handleKeyDown = (
        event: KeyboardEvent<HTMLButtonElement>,
        index: number,
    ) => {
        const targets: Record<string, number> = {
            ArrowLeft: index - 1,
            ArrowUp: index - 1,
            ArrowRight: index + 1,
            ArrowDown: index + 1,
            Home: 0,
            End: images.length - 1,
        };
        const target = targets[event.key];
        if (target === undefined) return;
        event.preventDefault();
        move(index, target);
    };

    return (
        <Dialog
            open
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogPortal>
                {/* The surface is the whole screen, so no dimmed backdrop. */}
                <DialogOverlay className="hidden" />
                <DialogPrimitive.Content className="kb-screen fixed inset-0 z-[60] flex flex-col bg-background">
                    <header className="shrink-0 border-b border-border/60 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
                        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="取消调整顺序"
                                className="grid size-10 shrink-0 place-items-center rounded-full border border-border/70 bg-background text-foreground"
                            >
                                <X className="size-4" />
                            </button>
                            <div className="min-w-0 flex-1 text-center">
                                <DialogPrimitive.Title asChild>
                                    <h2 className="text-[19px] leading-tight font-semibold tracking-tight">
                                        调整照片顺序
                                    </h2>
                                </DialogPrimitive.Title>
                                <DialogPrimitive.Description asChild>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        拖动照片，或选中后按方向键
                                    </p>
                                </DialogPrimitive.Description>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
                            >
                                <Check className="size-4" />
                                完成
                            </button>
                        </div>
                    </header>

                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                        <div
                            ref={gridRef}
                            className="mx-auto grid w-full max-w-md grid-cols-3 gap-2"
                        >
                            {images.map((image, index) => (
                                <button
                                    key={image.url}
                                    type="button"
                                    data-sort-slot={index}
                                    aria-label={`第 ${index + 1} 张照片，拖动或按方向键调整顺序`}
                                    onPointerDown={(event) =>
                                        handlePointerDown(event, index)
                                    }
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={endDrag}
                                    onPointerCancel={endDrag}
                                    onKeyDown={(event) =>
                                        handleKeyDown(event, index)
                                    }
                                    className={cn(
                                        "relative aspect-square touch-none overflow-hidden rounded-2xl bg-muted text-left transition-transform duration-150",
                                        dragIndex === index
                                            ? "z-10 scale-[1.03] ring-2 ring-primary"
                                            : "active:scale-[0.98]",
                                    )}
                                >
                                    <img
                                        src={image.url}
                                        alt=""
                                        draggable={false}
                                        className="pointer-events-none size-full object-cover"
                                    />
                                    <span
                                        aria-hidden="true"
                                        className="pointer-events-none absolute top-1.5 left-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-black/65 px-1.5 text-[11px] font-semibold text-white"
                                    >
                                        {index + 1}
                                    </span>
                                    <span
                                        aria-hidden="true"
                                        className="pointer-events-none absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full bg-black/65 text-white"
                                    >
                                        <GripVertical className="size-3.5" />
                                    </span>
                                </button>
                            ))}
                        </div>
                        <p
                            role="status"
                            aria-live="polite"
                            className="mx-auto mt-3 w-full max-w-md text-center text-[11px] text-muted-foreground"
                        >
                            {announcement ||
                                (layout === "instagram"
                                    ? "第 1 张会作为大图排版的封面"
                                    : "第 1 张会排在最前面")}
                        </p>
                    </div>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
