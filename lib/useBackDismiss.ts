import { useEffect, useRef } from "react";

/** History state flag for the sentinel entry pushed while an overlay is open. */
const HISTORY_MARKER = "__mimiOverlay";
/**
 * History state position used to tell a back traversal from a forward one.
 * Both the entry we leave and the sentinel carry it; a pop that lands on a
 * higher value went forward.
 */
const HISTORY_DEPTH = "__mimiOverlayDepth";

type Entry = {
    dismiss: () => void;
};

/** Open overlays in open order; the last entry is the topmost one. */
const stack: Entry[] = [];
let listening = false;
/** Set while `history.back()` runs from a UI close, not a back gesture. */
let ignoreNextPop = false;
/** Position of the history entry the browser is currently on. */
let currentDepth = 0;
/** Last position handed to a sentinel; only ever incremented. */
let nextDepth = 0;

const hasMarker = (state: unknown) =>
    Boolean((state as Record<string, unknown> | null)?.[HISTORY_MARKER]);

const readDepth = (state: unknown) => {
    const value = (state as Record<string, unknown> | null)?.[HISTORY_DEPTH];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

function pushSentinel() {
    const state = window.history.state ?? {};
    // Record where the entry we are leaving sits, so the pop back into it is
    // recognisable as a back traversal later.
    window.history.replaceState(
        { ...state, [HISTORY_DEPTH]: currentDepth },
        "",
    );
    currentDepth = ++nextDepth;
    window.history.pushState(
        { ...state, [HISTORY_MARKER]: true, [HISTORY_DEPTH]: currentDepth },
        "",
    );
}

function handlePopState(event: PopStateEvent) {
    // Entries we never stamped read as 0, which is always "behind" a sentinel.
    const next = readDepth(event.state);
    const forward = next > currentDepth;
    currentDepth = next;

    // We popped the sentinel ourselves after a UI close; not a back gesture.
    if (ignoreNextPop) {
        ignoreNextPop = false;
        return;
    }

    // A forward traversal returns to an entry we already left. Its overlay is
    // gone, so it must not close whatever is open now.
    if (forward) return;

    const top = stack[stack.length - 1];
    if (!top) return;

    stack.pop();
    if (stack.length) {
        // Another overlay is still open: keep a sentinel on top so the next
        // back gesture is swallowed too instead of leaving the page behind it.
        pushSentinel();
    } else if (hasMarker(window.history.state)) {
        // We landed on our own sentinel (something navigated above it), and
        // no overlay needs it any more. Drop it so the next back gesture goes
        // where the user expects instead of costing an extra swipe.
        ignoreNextPop = true;
        window.history.back();
    }
    top.dismiss();
}

function ensureListener() {
    if (listening) return;
    window.addEventListener("popstate", handlePopState);
    listening = true;
}

/**
 * Close an overlay when the browser back gesture (edge swipe or hardware back
 * button) is used, instead of navigating the page behind it away.
 *
 * Mobile browsers deliver that gesture as a history navigation. While at least
 * one overlay is open we keep one duplicate history entry on top, so the
 * gesture lands on the same page and popstate closes the overlay instead.
 *
 * Overlays form a stack: back closes the topmost one only, and nested sheets
 * (an AI panel over a drawer, settings over a panel) unwind one at a time. A
 * forward navigation does nothing here: only a back traversal dismisses.
 *
 * @param open whether the overlay is currently visible
 * @param onDismiss called to close it; keep the callback stable or not, the
 *   latest one is always used
 */
export function useBackDismiss(open: boolean, onDismiss: () => void) {
    const dismissRef = useRef(onDismiss);
    dismissRef.current = onDismiss;

    useEffect(() => {
        if (!open) return;

        const entry: Entry = { dismiss: () => dismissRef.current() };
        stack.push(entry);
        if (stack.length === 1) pushSentinel();
        ensureListener();

        return () => {
            const index = stack.indexOf(entry);
            // Already dismissed by a back gesture: the pop consumed the entry.
            if (index === -1) return;

            stack.splice(index, 1);
            // Another overlay still owns the sentinel.
            if (stack.length) return;
            // If the app navigated in the meantime the marker is gone, and the
            // entry we would pop belongs to that navigation, not to us.
            if (!hasMarker(window.history.state)) return;

            ignoreNextPop = true;
            window.history.back();
        };
    }, [open]);
}
