import { useEffect } from "react";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

type VirtualKeyboard = {
    boundingRect: DOMRectReadOnly;
    addEventListener: (type: "geometrychange", listener: () => void) => void;
    removeEventListener: (type: "geometrychange", listener: () => void) => void;
};

function isEditable(element: Element | null): element is HTMLElement {
    if (!element) return false;
    const html = element as HTMLElement;
    return EDITABLE_TAGS.has(element.tagName) || html.isContentEditable;
}

/**
 * Keeps a few CSS variables in sync with the on-screen keyboard.
 *
 * Mobile browsers do not resize the layout viewport when the keyboard opens
 * (iOS Safari in particular), so anything anchored with `fixed` / `dvh` ends
 * up behind the keyboard. Publishing the visual viewport lets fixed UI lift
 * itself above the keyboard and lets the app shell shrink to the visible area.
 *
 * - `--app-vvh`: visible viewport height
 * - `--app-vv-top`: visual viewport offset from the layout viewport top
 * - `--app-kb-inset`: how much of the layout viewport is hidden by the keyboard
 */
export function useVisualViewport() {
    useEffect(() => {
        const root = document.documentElement;
        const viewport = window.visualViewport;
        const virtualKeyboard = (
            navigator as Navigator & {
                virtualKeyboard?: VirtualKeyboard;
            }
        ).virtualKeyboard;

        let scrollTimer: number | undefined;
        let settleTimer: number | undefined;
        // Largest layout height seen so far; used to tell "the browser
        // resized the layout viewport" apart from "the keyboard overlays it".
        let baselineHeight = 0;

        const layoutHeight = () => {
            const clientHeight = root.clientHeight;
            return clientHeight > 0 ? clientHeight : window.innerHeight;
        };

        const update = () => {
            const layout = layoutHeight();
            baselineHeight = Math.max(baselineHeight, layout);

            const visualHeight = viewport?.height ?? 0;
            const offsetTop = viewport?.offsetTop ?? 0;
            const keyboardHeight = virtualKeyboard?.boundingRect.height ?? 0;

            // Fall back to the layout viewport when the browser reports a
            // zero-sized visual viewport (happens while the tab is loading or
            // backgrounded).
            let visibleHeight = visualHeight > 0 ? visualHeight : layout;
            let keyboardInset = Math.max(0, layout - visibleHeight - offsetTop);

            // Some Android WebViews keep both viewports at full height while
            // the keyboard overlays the page. Only trust the VirtualKeyboard
            // geometry when the layout viewport has not already shrunk.
            if (
                keyboardInset === 0 &&
                keyboardHeight > 0 &&
                layout >= baselineHeight - 1
            ) {
                keyboardInset = keyboardHeight;
                visibleHeight = Math.max(0, layout - keyboardHeight);
            }

            root.style.setProperty("--app-vvh", `${visibleHeight}px`);
            root.style.setProperty("--app-vv-top", `${offsetTop}px`);
            root.style.setProperty("--app-kb-inset", `${keyboardInset}px`);
        };

        // The focused field is laid out against the old viewport height, so
        // nudge it back into view once the keyboard animation settles.
        const revealActiveElement = () => {
            const active = document.activeElement;
            if (!isEditable(active)) return;
            active.scrollIntoView({ block: "nearest", inline: "nearest" });
        };

        const handleResize = () => {
            update();
            window.clearTimeout(scrollTimer);
            scrollTimer = window.setTimeout(revealActiveElement, 150);
        };

        // A few browsers open the keyboard without firing a resize event, so
        // re-measure shortly after focus changes as well.
        const handleFocusChange = () => {
            update();
            window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(update, 350);
        };

        const handleVisibility = () => {
            if (document.visibilityState === "visible") update();
        };

        update();
        window.requestAnimationFrame(update);

        viewport?.addEventListener("resize", handleResize);
        viewport?.addEventListener("scroll", update);
        virtualKeyboard?.addEventListener("geometrychange", handleResize);
        window.addEventListener("resize", update);
        window.addEventListener("orientationchange", update);
        window.addEventListener("pageshow", update);
        document.addEventListener("visibilitychange", handleVisibility);
        document.addEventListener("focusin", handleFocusChange);
        document.addEventListener("focusout", handleFocusChange);

        return () => {
            window.clearTimeout(scrollTimer);
            window.clearTimeout(settleTimer);
            viewport?.removeEventListener("resize", handleResize);
            viewport?.removeEventListener("scroll", update);
            virtualKeyboard?.removeEventListener(
                "geometrychange",
                handleResize,
            );
            window.removeEventListener("resize", update);
            window.removeEventListener("orientationchange", update);
            window.removeEventListener("pageshow", update);
            document.removeEventListener("visibilitychange", handleVisibility);
            document.removeEventListener("focusin", handleFocusChange);
            document.removeEventListener("focusout", handleFocusChange);
        };
    }, []);
}
