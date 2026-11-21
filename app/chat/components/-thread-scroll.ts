import { useCallback, useEffect, useRef, useState } from "react";

import type { LiveReply } from "@/app/chat/session/use-chat-session";

/**
 * Our own scroll-down affordance: assistant-ui's built-in button reports
 * "not at bottom" before the first scroll event and floats over the composer
 * on short threads.
 */
export function useThreadScroll({
    messagesLength,
    live,
    pendingInput,
}: {
    messagesLength: number;
    live: LiveReply | null;
    pendingInput: unknown;
}) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const [showScrollDown, setShowScrollDown] = useState(false);

    const scrollToBottom = useCallback(() => {
        const element = viewportRef.current;
        if (!element) return;
        element.scrollTo({
            top: element.scrollHeight,
            behavior: "smooth",
        });
    }, []);

    const updateScroll = useCallback(() => {
        const element = viewportRef.current;
        if (!element) return;
        setShowScrollDown(
            element.scrollHeight - element.scrollTop - element.clientHeight >
                60,
        );
    }, []);

    useEffect(() => {
        updateScroll();
    }, [updateScroll, messagesLength, live]);

    // Closing the ask_user panel changes the viewport height; keep the
    // conversation anchored to the bottom so the follow-up answer is visible.
    const wasPending = useRef(false);
    useEffect(() => {
        if (wasPending.current && pendingInput === null) {
            requestAnimationFrame(scrollToBottom);
        }
        wasPending.current = pendingInput !== null;
    }, [pendingInput, scrollToBottom]);

    return { viewportRef, showScrollDown, updateScroll, scrollToBottom };
}
