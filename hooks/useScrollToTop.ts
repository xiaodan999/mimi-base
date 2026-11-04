import { useCallback, useEffect, useState } from "react";

/** Show the button once the feed has scrolled about one screen. */
const SHOW_AFTER = 480;

/** The app shell scrolls `<main id="main-content">`, not the window. */
function getScroller(): HTMLElement | null {
    const main = document.getElementById("main-content");
    if (main) return main;
    return (document.scrollingElement as HTMLElement | null) ?? null;
}

/**
 * Tracks how far the app shell is scrolled and offers a jump back to the top.
 * Long infinite feeds can grow to hundreds of posts, so scrolling back up by
 * hand is not practical.
 */
export default function useScrollToTop() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const scroller = getScroller();
        if (!scroller) return;

        let frame = 0;
        const update = () => {
            frame = 0;
            setVisible(scroller.scrollTop > SHOW_AFTER);
        };
        const handleScroll = () => {
            if (frame) return;
            frame = requestAnimationFrame(update);
        };

        update();
        scroller.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            scroller.removeEventListener("scroll", handleScroll);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    const scrollToTop = useCallback(() => {
        const scroller = getScroller();
        if (!scroller) return;
        const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        scroller.scrollTo({
            top: 0,
            behavior: reduceMotion ? "auto" : "smooth",
        });
    }, []);

    return { visible, scrollToTop };
}
