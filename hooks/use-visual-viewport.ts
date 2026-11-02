import { useEffect } from "react";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

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

        let scrollTimer: number | undefined;

        const update = () => {
            const height = Math.round(viewport?.height ?? window.innerHeight);
            const offsetTop = Math.round(viewport?.offsetTop ?? 0);
            const layoutHeight = Math.round(window.innerHeight);

            root.style.setProperty("--app-vvh", `${height}px`);
            root.style.setProperty("--app-vv-top", `${offsetTop}px`);
            root.style.setProperty(
                "--app-kb-inset",
                `${Math.max(0, layoutHeight - height - offsetTop)}px`,
            );
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

        update();

        viewport?.addEventListener("resize", handleResize);
        viewport?.addEventListener("scroll", update);
        window.addEventListener("resize", update);
        window.addEventListener("orientationchange", update);

        return () => {
            window.clearTimeout(scrollTimer);
            viewport?.removeEventListener("resize", handleResize);
            viewport?.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
            window.removeEventListener("orientationchange", update);
        };
    }, []);
}
