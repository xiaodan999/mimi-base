import { useEffect, useRef } from "react";

/** History state flag for the sentinel entry pushed while an overlay is open. */
const HISTORY_MARKER = "__mimiOverlay";

type Entry = {
    dismiss: () => void;
};

/** Open overlays in open order; the last entry is the topmost one. */
const stack: Entry[] = [];
let listening = false;
/** Set while `history.back()` runs from a UI close, not a back gesture. */
let ignoreNextPop = false;

const hasMarker = (state: unknown) =>
    Boolean((state as Record<string, unknown> | null)?.[HISTORY_MARKER]);

function pushSentinel() {
    window.history.pushState(
        { ...(window.history.state ?? {}), [HISTORY_MARKER]: true },
        "",
    );
}

function handlePopState() {
    // We popped the sentinel ourselves after a UI close; not a back gesture.
    if (ignoreNextPop) {
        ignoreNextPop = false;
        return;
    }

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
 * (an AI panel over a drawer, settings over a panel) unwind one at a time.
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
