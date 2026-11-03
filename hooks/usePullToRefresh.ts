import { useEffect, useRef, useState } from "react";

/** Finger travel (content offset) that commits the refresh on release. */
export const PULL_THRESHOLD = 72;
/** Height of the indicator row that slides into the gap above the content. */
export const PULL_INDICATOR_HEIGHT = 44;

/** Hard cap so the page never slides away entirely. */
const MAX_PULL = 108;
/** The content trails the finger, so a modest drag opens a comfortable gap. */
const RESISTANCE = 0.5;
/** Ignore the first few pixels so taps and horizontal swipes still work. */
const DEAD_ZONE = 6;

export type PullToRefresh = {
    /** Attach to the page root; the hook finds its scroll container. */
    ref: React.RefObject<HTMLDivElement>;
    /** How far the content is currently offset, in px. */
    distance: number;
    /** True while the refresh promise is in flight. */
    refreshing: boolean;
    /** True while the finger is pulling; disables the snap-back transition. */
    dragging: boolean;
};

/**
 * Mobile pull-to-refresh for pages that scroll inside the app shell
 * (`<main id="main-content">` in `_main.tsx`).
 *
 * The shell owns the scroll container, so instead of hard-coding it the hook
 * walks up from the page root until it finds the element that actually
 * scrolls. That keeps the gesture working even if the shell changes.
 */
export default function usePullToRefresh(
    onRefresh: () => Promise<unknown>,
): PullToRefresh {
    const ref = useRef<HTMLDivElement>(null);
    const [distance, setDistance] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [dragging, setDragging] = useState(false);

    // The native listeners are attached once; refs keep them current.
    const onRefreshRef = useRef(onRefresh);
    onRefreshRef.current = onRefresh;
    const distanceRef = useRef(0);
    const refreshingRef = useRef(false);

    useEffect(() => {
        const anchor = ref.current;
        if (!anchor) return;

        let scroller: HTMLElement | null = anchor.parentElement;
        while (scroller && scroller !== document.body) {
            const overflowY = getComputedStyle(scroller).overflowY;
            if (overflowY === "auto" || overflowY === "scroll") break;
            scroller = scroller.parentElement;
        }

        const scrollTop = () =>
            scroller ? scroller.scrollTop : window.scrollY;
        const target: HTMLElement = scroller ?? document.documentElement;

        let startY = 0;
        let tracking = false;

        const setPull = (value: number) => {
            distanceRef.current = value;
            setDistance(value);
        };

        const reset = () => {
            tracking = false;
            setDragging(false);
            setPull(0);
        };

        const handleTouchStart = (event: TouchEvent) => {
            if (refreshingRef.current || event.touches.length !== 1) return;
            if (scrollTop() > 0) return;
            startY = event.touches[0].clientY;
            tracking = true;
        };

        const handleTouchMove = (event: TouchEvent) => {
            if (!tracking || event.touches.length !== 1) return;

            const delta = event.touches[0].clientY - startY;

            // Upward drags, and drags while the page is scrolled, belong to
            // the scroller. Stop tracking until the next touchstart.
            if (delta <= 0 || scrollTop() > 0) {
                reset();
                return;
            }

            if (delta < DEAD_ZONE) return;

            // Own the gesture so the scroller and the browser's own
            // pull-to-refresh never see it.
            event.preventDefault();
            setDragging(true);
            setPull(Math.min(MAX_PULL, delta * RESISTANCE));
        };

        const handleTouchEnd = () => {
            if (!tracking) return;
            tracking = false;
            setDragging(false);

            if (distanceRef.current < PULL_THRESHOLD) {
                setPull(0);
                return;
            }

            refreshingRef.current = true;
            setRefreshing(true);
            setPull(PULL_THRESHOLD);

            void Promise.resolve(onRefreshRef.current()).finally(() => {
                refreshingRef.current = false;
                setRefreshing(false);
                setPull(0);
            });
        };

        const handleTouchCancel = () => {
            if (!tracking) return;
            reset();
        };

        target.addEventListener("touchstart", handleTouchStart, {
            passive: true,
        });
        target.addEventListener("touchmove", handleTouchMove, {
            passive: false,
        });
        target.addEventListener("touchend", handleTouchEnd);
        target.addEventListener("touchcancel", handleTouchCancel);

        return () => {
            target.removeEventListener("touchstart", handleTouchStart);
            target.removeEventListener("touchmove", handleTouchMove);
            target.removeEventListener("touchend", handleTouchEnd);
            target.removeEventListener("touchcancel", handleTouchCancel);
        };
    }, []);

    return { ref, distance, refreshing, dragging };
}
