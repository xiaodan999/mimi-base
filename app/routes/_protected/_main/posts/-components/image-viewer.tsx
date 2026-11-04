import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import {
    clamp,
    clampScale,
    clampTranslation,
    distance,
    DOUBLE_TAP_SCALE,
    midpoint,
    panLimits,
    resolveSwipe,
    shouldDismiss,
    SNAP_BACK_SCALE,
    zoomAtPoint,
    type Point,
    type Size,
    type ZoomTransform,
} from "./viewer-gestures";

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

/** Movement that still counts as a tap instead of a drag. */
const TAP_SLOP = 8;
/** Two taps closer than this in time and space zoom instead of toggling UI. */
const DOUBLE_TAP_WINDOW = 300;
const DOUBLE_TAP_SLOP = 40;
const IDLE_ZOOM: ZoomTransform = { scale: 1, x: 0, y: 0 };
const SLIDE_MS = 300;
const ZOOM_MS = 240;
const DISMISS_MS = 220;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
/** History key used to swallow the back gesture while the viewer is open. */
const HISTORY_MARKER = "__mimiImageViewer";

type GestureMode = "pending" | "swipe" | "dismiss" | "pan" | "pinch";

type Gesture = {
    mode: GestureMode;
    start: Point;
    startedAt: number;
    /** Layer width when the gesture began (swipe threshold). */
    width: number;
    /** Zoom state the gesture started from. */
    baseZoom: ZoomTransform;
    moved: boolean;
    /** Pinch bookkeeping. */
    pinchDistance: number;
    pinchMid: Point;
    pinchZoom: ZoomTransform;
    /** Dismiss bookkeeping (a zoomed pan can hand off to dismissal). */
    dismissStartY: number;
    dismissBase: number;
    dismissStartedAt: number;
};

/**
 * Swallow the next back navigation while `open` is true.
 *
 * Mobile browsers fire the edge-swipe/back gesture as a history navigation.
 * Pushing a duplicate entry means that gesture lands on the same page
 * instead of leaving the feed, and the popstate lets us close the viewer.
 */
function useBackGestureDismiss(open: boolean, onDismiss: () => void) {
    const dismissRef = useRef(onDismiss);
    dismissRef.current = onDismiss;

    useEffect(() => {
        if (!open) return;

        window.history.pushState(
            { ...(window.history.state ?? {}), [HISTORY_MARKER]: true },
            "",
        );

        let popped = false;
        const handlePopState = (event: PopStateEvent) => {
            const state = event.state as Record<string, unknown> | null;
            if (state?.[HISTORY_MARKER]) return;
            popped = true;
            dismissRef.current();
        };

        window.addEventListener("popstate", handlePopState);
        return () => {
            window.removeEventListener("popstate", handlePopState);
            // Closed from the UI: drop the duplicate entry so the next back
            // gesture goes where the user expects it to.
            if (!popped && window.history.state?.[HISTORY_MARKER]) {
                window.history.back();
            }
        };
    }, [open]);
}

/**
 * Full-screen image viewer with native-style gestures: swipe between images,
 * pinch or double tap to zoom, drag to pan while zoomed, drag down to
 * dismiss, and the browser back gesture closes the viewer.
 *
 * Motion is animated with the Web Animations API rather than CSS
 * transitions so the target state is applied immediately and a new touch can
 * take over from wherever the animation currently is.
 */
export default function ImageViewer({
    images,
    index,
    open,
    onOpenChange,
}: ImageViewerProps) {
    const layerRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    /**
     * Layout box of the gesture layer. `getBoundingClientRect` is not used
     * for the size: the dialog's open animation scales it to 95%, and that
     * scaled width would make every carousel offset 5% short.
     */
    const rectRef = useRef<{
        left: number;
        top: number;
        width: number;
        height: number;
    } | null>(null);
    /** Layout size of the current image, unaffected by its CSS transform. */
    const baseRef = useRef<Size>({ width: 0, height: 0 });
    const pointersRef = useRef(new Map<number, Point>());
    const gestureRef = useRef<Gesture | null>(null);
    const zoomRef = useRef<ZoomTransform>(IDLE_ZOOM);
    const dragRef = useRef<Point>({ x: 0, y: 0 });
    const currentRef = useRef(index);
    const backdropValueRef = useRef(1);
    const lastTapRef = useRef<{ x: number; y: number; at: number } | null>(
        null,
    );
    const tapTimerRef = useRef<number | null>(null);
    const closeTimerRef = useRef<number | null>(null);
    const animationsRef = useRef<Animation[]>([]);
    const openChangeRef = useRef(onOpenChange);
    openChangeRef.current = onOpenChange;

    const [current, setCurrent] = useState(index);
    const [zoom, setZoom] = useState<ZoomTransform>(IDLE_ZOOM);
    const [drag, setDrag] = useState<Point>({ x: 0, y: 0 });
    const [backdrop, setBackdrop] = useState(1);
    const [chromeVisible, setChromeVisible] = useState(true);
    const [viewport, setViewport] = useState<Size>(() => ({
        width: typeof window === "undefined" ? 0 : window.innerWidth,
        height: typeof window === "undefined" ? 0 : window.innerHeight,
    }));

    const viewSize = useCallback((): Size => {
        const rect = rectRef.current;
        return rect
            ? { width: rect.width, height: rect.height }
            : { width: viewport.width, height: viewport.height };
    }, [viewport.height, viewport.width]);

    const cancelAnimations = useCallback(() => {
        for (const animation of animationsRef.current) animation.cancel();
        animationsRef.current = [];
    }, []);

    /** Cache the layer box and the untransformed image size. */
    const measure = useCallback(() => {
        const layer = layerRef.current;
        if (!layer) return;
        const rect = layer.getBoundingClientRect();
        // `getComputedStyle` reports the used layout size without the
        // dialog's animation transform and without clientWidth rounding, so
        // slide offsets stay exact (390.4, not 390).
        const computed = getComputedStyle(layer);
        const width = Number.parseFloat(computed.width) || layer.clientWidth;
        const height = Number.parseFloat(computed.height) || layer.clientHeight;
        // Keep the visual centre (correct under any animation transform) but
        // the layout size (correct for offsets and hit coordinates).
        rectRef.current = {
            left: rect.left + (rect.width - width) / 2,
            top: rect.top + (rect.height - height) / 2,
            width,
            height,
        };
        setViewport((previous) =>
            previous.width === width && previous.height === height
                ? previous
                : { width, height },
        );
        const image = imageRef.current;
        if (image?.complete) {
            baseRef.current = {
                width: image.clientWidth,
                height: image.clientHeight,
            };
        }
    }, []);

    const trackTransform = useCallback(
        (target: number, offset: Point): string => {
            const width = viewSize().width || window.innerWidth;
            const height = viewSize().height || window.innerHeight;
            const progress = Math.min(1, Math.abs(offset.y) / height);
            return `translate3d(${-target * width + offset.x}px, ${offset.y}px, 0) scale(${1 - progress * 0.25})`;
        },
        [viewSize],
    );

    const imageTransform = (value: ZoomTransform): string =>
        `translate3d(${value.x}px, ${value.y}px, 0) scale(${value.scale})`;

    useBackGestureDismiss(open, () => onOpenChange(false));

    // Reset every gesture/zoom value whenever the viewer (re)opens.
    useEffect(() => {
        if (!open) return;
        currentRef.current = index;
        zoomRef.current = IDLE_ZOOM;
        dragRef.current = { x: 0, y: 0 };
        backdropValueRef.current = 1;
        setCurrent(index);
        setZoom(IDLE_ZOOM);
        setDrag({ x: 0, y: 0 });
        setBackdrop(1);
        setChromeVisible(true);
        cancelAnimations();
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    }, [open, index, cancelAnimations]);

    // Measure synchronously once the layer is mounted, and again after a
    // rotation changes the contain box.
    useLayoutEffect(() => {
        if (!open) return;
        measure();
    }, [open, current, measure]);

    useEffect(() => {
        if (!open) return;
        const layer = layerRef.current;
        if (!layer) return;
        const observer = new ResizeObserver(measure);
        observer.observe(layer);
        window.addEventListener("resize", measure);
        window.addEventListener("orientationchange", measure);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", measure);
            window.removeEventListener("orientationchange", measure);
        };
    }, [open, measure]);

    // Warm the neighbouring full-size images so swiping feels instant.
    useEffect(() => {
        if (!open) return;
        for (const neighbour of [index - 1, index + 1]) {
            const image = images[neighbour];
            if (!image) continue;
            const preload = new Image();
            preload.src = image.url;
        }
    }, [open, index, images]);

    useEffect(
        () => () => {
            if (tapTimerRef.current !== null) {
                window.clearTimeout(tapTimerRef.current);
            }
            if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
            }
            cancelAnimations();
        },
        [cancelAnimations],
    );

    const localPoint = (clientX: number, clientY: number): Point => {
        const rect = rectRef.current;
        if (!rect) return { x: clientX, y: clientY };
        return {
            x: clientX - rect.left - rect.width / 2,
            y: clientY - rect.top - rect.height / 2,
        };
    };

    const clearTapTimer = () => {
        if (tapTimerRef.current === null) return;
        window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
    };

    const commitBackdrop = (value: number) => {
        backdropValueRef.current = value;
        setBackdrop(value);
    };

    /**
     * Animate an element between two transform/opacity states and keep the
     * handle so a new gesture can cancel it. The final state is already in
     * React, so the animation only provides the transition.
     */
    const animate = (
        element: HTMLElement | null,
        from: Keyframe,
        to: Keyframe,
        duration: number,
    ) => {
        if (!element) return;
        const animation = element.animate([from, to], {
            duration,
            easing: EASE_OUT,
        });
        animationsRef.current.push(animation);
        // Finished animations no longer affect the element (React owns the
        // final style); drop them so the handle list cannot grow.
        void animation.finished
            .catch(() => undefined)
            .then(() => {
                animationsRef.current = animationsRef.current.filter(
                    (entry) => entry !== animation,
                );
            });
    };

    const animateZoomTo = (next: ZoomTransform) => {
        const element = imageRef.current;
        const from = imageTransform(zoomRef.current);
        cancelAnimations();
        zoomRef.current = next;
        setZoom(next);
        animate(
            element,
            { transform: from },
            { transform: imageTransform(next) },
            ZOOM_MS,
        );
    };

    const slideTo = (next: number) => {
        const from = trackTransform(currentRef.current, dragRef.current);
        const fromOpacity = backdropValueRef.current;
        const target: Point = { x: 0, y: 0 };

        cancelAnimations();
        currentRef.current = next;
        setCurrent(next);
        zoomRef.current = IDLE_ZOOM;
        setZoom(IDLE_ZOOM);
        dragRef.current = target;
        setDrag(target);
        commitBackdrop(1);

        animate(
            trackRef.current,
            { transform: from },
            { transform: trackTransform(next, target) },
            SLIDE_MS,
        );
        animate(
            backdropRef.current,
            { opacity: fromOpacity },
            { opacity: 1 },
            SLIDE_MS,
        );
    };

    const settleZoom = () => {
        const value = zoomRef.current;
        if (value.scale < SNAP_BACK_SCALE) {
            animateZoomTo(IDLE_ZOOM);
            return;
        }
        const clamped = clampTranslation(value, baseRef.current, viewSize());
        if (clamped.x !== value.x || clamped.y !== value.y) {
            animateZoomTo(clamped);
        }
    };

    /** Snap the carousel and backdrop back to rest after a cancelled drag. */
    const settleTrack = () => {
        const from = dragRef.current;
        const fromOpacity = backdropValueRef.current;
        const reset: Point = { x: 0, y: 0 };
        cancelAnimations();
        dragRef.current = reset;
        setDrag(reset);
        commitBackdrop(1);
        animate(
            trackRef.current,
            { transform: trackTransform(currentRef.current, from) },
            { transform: trackTransform(currentRef.current, reset) },
            SLIDE_MS,
        );
        animate(
            backdropRef.current,
            { opacity: fromOpacity },
            { opacity: 1 },
            SLIDE_MS,
        );
    };

    const goTo = (target: number) => {
        const next = clamp(target, 0, images.length - 1);
        if (next === currentRef.current) return;
        setChromeVisible(true);
        slideTo(next);
    };

    const closeWithGesture = () => {
        const from = trackTransform(currentRef.current, dragRef.current);
        const fromOpacity = backdropValueRef.current;
        const height = viewSize().height || window.innerHeight;
        const target: Point = { x: 0, y: height + 120 };

        cancelAnimations();
        setChromeVisible(false);
        dragRef.current = target;
        setDrag(target);
        commitBackdrop(0);

        animate(
            trackRef.current,
            { transform: from },
            { transform: trackTransform(currentRef.current, target) },
            DISMISS_MS,
        );
        animate(
            backdropRef.current,
            { opacity: fromOpacity },
            { opacity: 0 },
            DISMISS_MS,
        );

        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
        }
        closeTimerRef.current = window.setTimeout(() => {
            closeTimerRef.current = null;
            openChangeRef.current(false);
        }, DISMISS_MS + 30);
    };

    const handleDoubleTap = (clientX: number, clientY: number) => {
        clearTapTimer();
        if (zoomRef.current.scale > SNAP_BACK_SCALE) {
            animateZoomTo(IDLE_ZOOM);
            return;
        }
        animateZoomTo(
            zoomAtPoint(
                zoomRef.current,
                localPoint(clientX, clientY),
                DOUBLE_TAP_SCALE,
                baseRef.current,
                viewSize(),
            ),
        );
    };

    const handleTap = (clientX: number, clientY: number) => {
        const now = performance.now();
        const previous = lastTapRef.current;
        if (
            previous &&
            now - previous.at < DOUBLE_TAP_WINDOW &&
            Math.hypot(clientX - previous.x, clientY - previous.y) <
                DOUBLE_TAP_SLOP
        ) {
            lastTapRef.current = null;
            handleDoubleTap(clientX, clientY);
            return;
        }

        lastTapRef.current = { x: clientX, y: clientY, at: now };
        clearTapTimer();
        tapTimerRef.current = window.setTimeout(() => {
            tapTimerRef.current = null;
            lastTapRef.current = null;
            setChromeVisible((visible) => !visible);
        }, DOUBLE_TAP_WINDOW);
    };

    const startPinch = () => {
        const points = [...pointersRef.current.values()];
        if (points.length < 2) return;
        const [a, b] = points;
        const mid = midpoint(a, b);
        const currentZoom = zoomRef.current;
        const now = performance.now();

        cancelAnimations();
        dragRef.current = { x: 0, y: 0 };
        setDrag({ x: 0, y: 0 });
        commitBackdrop(1);
        gestureRef.current = {
            mode: "pinch",
            start: mid,
            startedAt: now,
            width: rectRef.current?.width ?? window.innerWidth,
            baseZoom: currentZoom,
            moved: true,
            pinchDistance: distance(a, b),
            pinchMid: localPoint(mid.x, mid.y),
            pinchZoom: currentZoom,
            dismissStartY: mid.y,
            dismissBase: 0,
            dismissStartedAt: now,
        };
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        // The viewer is animating away; let the close finish.
        if (closeTimerRef.current !== null) return;
        // Capture keeps the gesture alive when the finger leaves the layer.
        // Synthetic/replayed pointers have no capture target; ignore those.
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // Not an active pointer; moves still reach this element.
        }
        pointersRef.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
        });
        clearTapTimer();
        cancelAnimations();

        if (pointersRef.current.size >= 2) {
            startPinch();
            return;
        }

        const startedAt = performance.now();
        gestureRef.current = {
            mode: "pending",
            start: { x: event.clientX, y: event.clientY },
            startedAt,
            width: rectRef.current?.width ?? window.innerWidth,
            baseZoom: zoomRef.current,
            moved: false,
            pinchDistance: 0,
            pinchMid: { x: 0, y: 0 },
            pinchZoom: zoomRef.current,
            dismissStartY: event.clientY,
            dismissBase: 0,
            dismissStartedAt: startedAt,
        };
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const pointer = pointersRef.current.get(event.pointerId);
        if (!pointer) return;
        pointer.x = event.clientX;
        pointer.y = event.clientY;

        const gesture = gestureRef.current;
        if (!gesture) return;

        if (gesture.mode === "pinch") {
            const points = [...pointersRef.current.values()];
            if (points.length < 2) return;
            const [a, b] = points;
            if (gesture.pinchDistance < 1) return;

            const scale = clampScale(
                gesture.pinchZoom.scale *
                    (distance(a, b) / gesture.pinchDistance),
            );
            const ratio = scale / gesture.pinchZoom.scale;
            const mid = midpoint(a, b);
            const midLocal = localPoint(mid.x, mid.y);
            zoomRef.current = clampTranslation(
                {
                    scale,
                    x:
                        midLocal.x -
                        ratio * (gesture.pinchMid.x - gesture.pinchZoom.x),
                    y:
                        midLocal.y -
                        ratio * (gesture.pinchMid.y - gesture.pinchZoom.y),
                },
                baseRef.current,
                viewSize(),
            );
            setZoom(zoomRef.current);
            return;
        }

        const dx = event.clientX - gesture.start.x;
        const dy = event.clientY - gesture.start.y;

        if (gesture.mode === "pending") {
            if (Math.hypot(dx, dy) < TAP_SLOP) return;
            gesture.moved = true;
            if (gesture.baseZoom.scale > 1.01) {
                gesture.mode = "pan";
            } else if (Math.abs(dx) > Math.abs(dy)) {
                gesture.mode = "swipe";
            } else {
                gesture.mode = "dismiss";
            }
        }

        if (gesture.mode === "pan") {
            const proposed = {
                scale: gesture.baseZoom.scale,
                x: gesture.baseZoom.x + dx,
                y: gesture.baseZoom.y + dy,
            };
            zoomRef.current = clampTranslation(
                proposed,
                baseRef.current,
                viewSize(),
            );
            setZoom(zoomRef.current);

            // A downward drag past the top edge (or on an image with no
            // vertical overflow) hands the rest of the gesture to dismissal,
            // so swiping down works even while zoomed.
            const limit = panLimits(
                gesture.baseZoom.scale,
                baseRef.current,
                viewSize(),
            );
            const pulledPastTop =
                dy > 12 && dy > Math.abs(dx) * 0.6 && proposed.y > limit.y;
            if (pulledPastTop) {
                const overflow = proposed.y - limit.y;
                const height = viewSize().height || window.innerHeight;
                gesture.mode = "dismiss";
                gesture.dismissStartY = event.clientY;
                gesture.dismissBase = overflow;
                gesture.dismissStartedAt = performance.now();
                dragRef.current = { x: 0, y: overflow };
                setDrag(dragRef.current);
                commitBackdrop(Math.max(0.15, 1 - overflow / (height * 0.6)));
            }
            return;
        }

        if (gesture.mode === "swipe") {
            const atEdge =
                (currentRef.current === 0 && dx > 0) ||
                (currentRef.current === images.length - 1 && dx < 0);
            dragRef.current = { x: atEdge ? dx * 0.35 : dx, y: 0 };
            setDrag(dragRef.current);
            return;
        }

        if (gesture.mode === "dismiss") {
            const fingerY = event.clientY - gesture.dismissStartY;
            const y = gesture.dismissBase + Math.max(0, fingerY);
            const height = viewSize().height || window.innerHeight;
            dragRef.current = { x: 0, y };
            setDrag(dragRef.current);
            commitBackdrop(Math.max(0.15, 1 - y / (height * 0.6)));
        }
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        pointersRef.current.delete(event.pointerId);
        const gesture = gestureRef.current;
        if (!gesture) return;

        if (gesture.mode === "pinch") {
            if (pointersRef.current.size >= 2) {
                startPinch();
                return;
            }
            if (pointersRef.current.size === 1) {
                // One finger stays down: continue panning with it.
                const remaining = [...pointersRef.current.values()][0];
                gestureRef.current = {
                    ...gesture,
                    mode: zoomRef.current.scale > 1.01 ? "pan" : "pending",
                    start: { x: remaining.x, y: remaining.y },
                    startedAt: performance.now(),
                    baseZoom: zoomRef.current,
                    moved: zoomRef.current.scale > 1.01,
                };
                return;
            }
            gestureRef.current = null;
            settleZoom();
            return;
        }

        if (pointersRef.current.size > 0) return;
        gestureRef.current = null;

        const dx = event.clientX - gesture.start.x;

        if (gesture.mode === "pending" && !gesture.moved) {
            handleTap(event.clientX, event.clientY);
            return;
        }

        if (gesture.mode === "pan") {
            settleZoom();
            return;
        }

        const elapsed = Math.max(1, performance.now() - gesture.startedAt);

        if (gesture.mode === "swipe") {
            const target = resolveSwipe(dx, dx / elapsed, gesture.width);
            const next = currentRef.current + target;
            if (target === 0 || next < 0 || next >= images.length) {
                settleTrack();
                return;
            }
            setChromeVisible(true);
            slideTo(next);
            return;
        }

        if (gesture.mode === "dismiss") {
            const dragY = dragRef.current.y;
            const dismissElapsed = Math.max(
                1,
                performance.now() - gesture.dismissStartedAt,
            );
            const velocity = (dragY - gesture.dismissBase) / dismissElapsed;
            if (shouldDismiss(dragY, velocity)) {
                closeWithGesture();
                return;
            }
            settleTrack();
        }
    };

    const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
        pointersRef.current.delete(event.pointerId);
        const gesture = gestureRef.current;
        if (!gesture || pointersRef.current.size > 0) return;
        gestureRef.current = null;
        if (gesture.mode === "pan" || gesture.mode === "pinch") {
            settleZoom();
        } else if (gesture.mode === "swipe" || gesture.mode === "dismiss") {
            settleTrack();
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                overlayClassName="bg-transparent"
                className="flex h-[100dvh] w-screen max-w-none !animate-none items-center justify-center rounded-none border-0 bg-transparent p-0 text-white data-[state=closed]:!animate-none data-[state=open]:!animate-none [&>button]:hidden"
                onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        goTo(currentRef.current - 1);
                    }
                    if (event.key === "ArrowRight") {
                        event.preventDefault();
                        goTo(currentRef.current + 1);
                    }
                }}
            >
                <DialogTitle className="sr-only">查看图片</DialogTitle>
                <DialogDescription className="sr-only">
                    左右滑动切换图片，双指或双击缩放，向下拖动关闭
                </DialogDescription>

                <div
                    ref={backdropRef}
                    aria-hidden
                    className="absolute inset-0 bg-black"
                    style={{ opacity: backdrop }}
                />

                <div
                    ref={layerRef}
                    className="absolute inset-0 touch-none select-none overflow-hidden"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onContextMenu={(event) => event.preventDefault()}
                    onDragStart={(event) => event.preventDefault()}
                >
                    <div
                        ref={trackRef}
                        className="absolute inset-0 flex will-change-transform"
                        style={{
                            transform: trackTransform(current, drag),
                        }}
                    >
                        {images.map((image, imageIndex) => (
                            <div
                                key={image.name}
                                className="relative flex h-full w-full shrink-0 items-center justify-center"
                            >
                                <img
                                    ref={
                                        imageIndex === current
                                            ? imageRef
                                            : undefined
                                    }
                                    src={image.url}
                                    alt=""
                                    draggable={false}
                                    decoding="async"
                                    onLoad={measure}
                                    className="max-h-full max-w-full select-none object-contain [-webkit-touch-callout:none]"
                                    style={
                                        imageIndex === current
                                            ? {
                                                  transform:
                                                      imageTransform(zoom),
                                              }
                                            : undefined
                                    }
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div
                    className={cn(
                        "pointer-events-none absolute inset-0 z-10 transition-opacity duration-200",
                        chromeVisible ? "opacity-100" : "invisible opacity-0",
                    )}
                >
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        aria-label="关闭"
                        className="pointer-events-auto absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] rounded-full bg-white/15 p-2 active:bg-white/30"
                    >
                        <X className="size-5" />
                    </button>

                    {images.length > 1 && (
                        <span className="absolute left-1/2 top-[calc(1rem+env(safe-area-inset-top))] -translate-x-1/2 text-sm text-white/80">
                            {current + 1}/{images.length}
                        </span>
                    )}

                    {images.length > 1 && current > 0 && (
                        <button
                            type="button"
                            onClick={() => goTo(current - 1)}
                            aria-label="上一张"
                            className="pointer-events-auto absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/15 p-2 active:bg-white/30 sm:block"
                        >
                            <ChevronLeft className="size-5" />
                        </button>
                    )}
                    {images.length > 1 && current < images.length - 1 && (
                        <button
                            type="button"
                            onClick={() => goTo(current + 1)}
                            aria-label="下一张"
                            className="pointer-events-auto absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/15 p-2 active:bg-white/30 sm:block"
                        >
                            <ChevronRight className="size-5" />
                        </button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
