import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Play, X } from "lucide-react";
import {
    type KeyboardEvent,
    type PointerEvent,
    useLayoutEffect,
    useRef,
    useState,
} from "react";

import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import type { PostLayout } from "@/lib/pb-types";
import { videoFirstFrameUrl } from "@/lib/postMedia";
import { cn } from "@/lib/utils";

import { type SortSlotRect, sortTargetAt } from "../utils";
import type { PreviewMedia } from "./usePostDraft";

type PostMediaSortProps = {
    media: PreviewMedia[];
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
    key: string;
    /** Slot offset accumulated as the media reorder underneath the pointer. */
    baseX: number;
    baseY: number;
    /** Current visual offset from the tile's slot. */
    offsetX: number;
    offsetY: number;
};

type DragVisual = {
    key: string;
    x: number;
    y: number;
};

const DRAG_THRESHOLD = 6;
const FLIP_DURATION = 180;

function prefersReducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const DROP_EASING = "cubic-bezier(0.2, 0, 0, 1)";

function tileElements(grid: HTMLDivElement | null): HTMLElement[] {
    if (!grid) return [];
    return Array.from(grid.querySelectorAll<HTMLElement>("[data-sort-key]"));
}

/**
 * Full-screen media ordering surface.
 *
 * The composer grid only shows small numbered tiles; moving order there meant
 * tiny arrow buttons layered over every item. This view gives each photo and
 * video a real tile and supports dragging anywhere on the tile (touch and
 * mouse), while keeping the reorder action available from the keyboard (arrow
 * keys), which also keeps it usable for screen readers. Photos and videos mix
 * freely: the tile's key is its preview URL, so no type-specific logic is
 * needed beyond what a tile draws.
 *
 * The dragged tile follows the pointer while the other tiles slide into their
 * new slots. Reordering happens as the pointer crosses a slot, so releasing
 * simply drops the tile where it already appears.
 */
export default function PostMediaSort({
    media,
    layout,
    onMove,
    onClose,
}: PostMediaSortProps) {
    const gridRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const flipRef = useRef<Map<string, DOMRect>>(new Map());
    const [dragVisual, setDragVisual] = useState<DragVisual | null>(null);
    const [announcement, setAnnouncement] = useState("");
    const activeKey = dragVisual?.key;

    const captureTileRects = () => {
        const rects = new Map<string, DOMRect>();
        for (const element of tileElements(gridRef.current)) {
            const key = element.dataset.sortKey;
            if (key) rects.set(key, element.getBoundingClientRect());
        }
        flipRef.current = rects;
    };

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

    const findSlot = (slots: SortSlotRect[], index: number) =>
        slots.find((slot) => slot.index === index);

    const move = (from: number, to: number) => {
        if (from === to || to < 0 || to >= media.length) return;
        // Capture before the reorder so every other tile can slide from its
        // previous slot instead of jumping.
        captureTileRects();
        onMove(from, to);
        setAnnouncement(`已移动到第 ${to + 1} 个`);
    };

    // FLIP the tiles that were not dragged: measure where they were before
    // the reorder and animate them in from there.
    useLayoutEffect(() => {
        const previous = flipRef.current;
        if (previous.size === 0) return;
        flipRef.current = new Map();
        const reduced = prefersReducedMotion();
        for (const element of tileElements(gridRef.current)) {
            const key = element.dataset.sortKey;
            if (!key || key === activeKey) continue;
            const before = previous.get(key);
            if (!before) continue;
            const after = element.getBoundingClientRect();
            const x = before.left - after.left;
            const y = before.top - after.top;
            if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
            element.animate(
                [
                    { transform: `translate3d(${x}px, ${y}px, 0)` },
                    { transform: "translate3d(0, 0, 0)" },
                ],
                {
                    duration: reduced ? 0 : FLIP_DURATION,
                    easing: DROP_EASING,
                },
            );
        }
    }, [media, activeKey]);

    const handlePointerDown = (
        event: PointerEvent<HTMLButtonElement>,
        index: number,
    ) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const item = media[index];
        if (!item) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerId: event.pointerId,
            index,
            startX: event.clientX,
            startY: event.clientY,
            active: false,
            slots: slotRects(),
            key: item.url,
            baseX: 0,
            baseY: 0,
            offsetX: 0,
            offsetY: 0,
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
        }

        const target = sortTargetAt(drag.slots, event.clientX, event.clientY);
        if (target !== null && target !== drag.index) {
            const fromSlot = findSlot(drag.slots, drag.index);
            const toSlot = findSlot(drag.slots, target);
            if (fromSlot && toSlot) {
                // The tile's slot moved by this much; subtract it from the
                // visual offset so the tile stays under the pointer.
                drag.baseX += toSlot.left - fromSlot.left;
                drag.baseY += toSlot.top - fromSlot.top;
            }
            captureTileRects();
            onMove(drag.index, target);
            setAnnouncement(`已移动到第 ${target + 1} 个`);
            drag.index = target;
        }

        drag.offsetX = event.clientX - drag.startX - drag.baseX;
        drag.offsetY = event.clientY - drag.startY - drag.baseY;
        setDragVisual({
            key: drag.key,
            x: drag.offsetX,
            y: drag.offsetY,
        });
    };

    const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;

        if (drag.active && (drag.offsetX !== 0 || drag.offsetY !== 0)) {
            const element = tileElements(gridRef.current).find(
                (tile) => tile.dataset.sortKey === drag.key,
            );
            element?.animate(
                [
                    {
                        transform: `translate3d(${drag.offsetX}px, ${drag.offsetY}px, 0) scale(1.04)`,
                    },
                    { transform: "translate3d(0, 0, 0) scale(1)" },
                ],
                {
                    duration: prefersReducedMotion() ? 0 : FLIP_DURATION,
                    easing: DROP_EASING,
                },
            );
        }

        setDragVisual(null);
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
            End: media.length - 1,
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
                                        调整媒体顺序
                                    </h2>
                                </DialogPrimitive.Title>
                                <DialogPrimitive.Description asChild>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        按住任意照片或视频拖动，或选中后按方向键
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
                            {media.map((item, index) => {
                                const visual =
                                    activeKey === item.url ? dragVisual : null;
                                const dragging = visual !== null;
                                return (
                                    <button
                                        key={item.url}
                                        type="button"
                                        data-sort-slot={index}
                                        data-sort-key={item.url}
                                        aria-label={`第 ${index + 1} 个媒体，整块可拖动，或按方向键调整顺序`}
                                        onPointerDown={(event) =>
                                            handlePointerDown(event, index)
                                        }
                                        onPointerMove={handlePointerMove}
                                        onPointerUp={endDrag}
                                        onPointerCancel={endDrag}
                                        onKeyDown={(event) =>
                                            handleKeyDown(event, index)
                                        }
                                        style={
                                            visual
                                                ? {
                                                      transform: `translate3d(${visual.x}px, ${visual.y}px, 0) scale(1.04)`,
                                                  }
                                                : undefined
                                        }
                                        className={cn(
                                            "relative aspect-square touch-none overflow-hidden rounded-2xl bg-muted text-left transition-[scale,box-shadow] duration-150",
                                            dragging
                                                ? "z-20 cursor-grabbing shadow-lift ring-2 ring-primary"
                                                : "cursor-grab active:scale-[0.98]",
                                        )}
                                    >
                                        {item.type === "image" ? (
                                            <img
                                                src={item.url}
                                                alt=""
                                                draggable={false}
                                                className="pointer-events-none size-full object-cover"
                                            />
                                        ) : (
                                            <>
                                                <video
                                                    src={videoFirstFrameUrl(
                                                        item.url,
                                                    )}
                                                    muted
                                                    playsInline
                                                    preload="metadata"
                                                    className="pointer-events-none size-full bg-black object-cover"
                                                />
                                                <span
                                                    aria-hidden="true"
                                                    className="pointer-events-none absolute inset-0 grid place-items-center"
                                                >
                                                    <span className="grid size-8 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/30">
                                                        <Play className="ml-0.5 size-3.5 fill-current" />
                                                    </span>
                                                </span>
                                            </>
                                        )}
                                        <span
                                            aria-hidden="true"
                                            className="pointer-events-none absolute top-1.5 left-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-black/65 px-1.5 text-[11px] font-semibold text-white"
                                        >
                                            {index + 1}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <p
                            role="status"
                            aria-live="polite"
                            className="mx-auto mt-3 w-full max-w-md text-center text-[11px] text-muted-foreground"
                        >
                            {announcement ||
                                (layout === "instagram"
                                    ? "第 1 个会作为大图排版的封面"
                                    : "第 1 个会排在最前面")}
                        </p>
                    </div>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
