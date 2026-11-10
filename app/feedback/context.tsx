import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { installFeedbackCapture, rememberRoute } from "./error-buffer";

/**
 * Mounted once in the app shell. Installs the error ring buffer and remembers
 * the last non-feedback page so the form can report where the bug happened
 * instead of always saying `/feedback`.
 */
export function FeedbackCapture() {
    const pathname = useRouterState({
        select: (state) => state.location.pathname,
    });

    useEffect(() => {
        rememberRoute(pathname);
    }, [pathname]);

    useEffect(() => installFeedbackCapture(), []);

    return null;
}
