import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";

import { AiProvider } from "@/app/ai/AiContext";
import { noteCurrentUser } from "@/app/ai/reset";
import { abortAllChatRuns } from "@/app/chat/run-store";
import { useFeedRealtime } from "@/app/feed/realtime";
import { FeedbackCapture } from "@/app/feedback/context";
import NavButtons, { DesktopNav } from "@/components/NavButtons";
import OfflineBanner from "@/components/OfflineBanner";
import { RouteError } from "@/components/RouteError";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useCurrentUser } from "@/lib/auth";

export const Route = createFileRoute("/_protected/_main")({
    component: Layout,
    errorComponent: RouteError,
});

function Layout() {
    const user = useCurrentUser();
    // One realtime subscription layer for every page inside the shell; it
    // closes on logout and reconnects with the auth session.
    useRealtimeSync();
    // Patch feed counters in place instead of invalidating every loaded page.
    useFeedRealtime(user.id);

    // Chat runs outlive the conversation route on purpose; leaving the app
    // shell or switching accounts is the one place they must not keep running.
    useEffect(() => abortAllChatRuns, [user.id]);

    // A different account on this device must not see the previous user's
    // cached AI results/interrupted prompts. Keying AiProvider below also
    // drops the in-memory task center.
    useEffect(() => {
        noteCurrentUser(user.id);
    }, [user.id]);

    return (
        <AiProvider key={user.id}>
            <FeedbackCapture />
            <div className="flex h-full flex-col bg-background lg:flex-row">
                <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
                >
                    跳到主要内容
                </a>
                <DesktopNav />
                <div className="flex min-h-0 flex-1 flex-col">
                    {/* A stable key for TanStack Router scroll restoration. Its
                        default nth-child path shifts while a Radix dialog adds
                        focus-guard spans to <body>, which made every sheet
                        close snap this container back to the top. */}
                    <main
                        id="main-content"
                        tabIndex={-1}
                        data-scroll-restoration-id="main-content"
                        className="flex-1 overflow-auto overscroll-contain outline-hidden"
                    >
                        <Outlet />
                    </main>

                    <OfflineBanner />
                    <NavButtons />
                </div>
            </div>
        </AiProvider>
    );
}
