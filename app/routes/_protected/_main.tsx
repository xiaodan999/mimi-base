import { useEffect } from "react";
import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AiProvider } from "@/app/ai/AiContext";
import { abortAllChatRuns } from "@/app/chat/run-store";
import NavButtons from "@/components/NavButtons";
import OfflineBanner from "@/components/OfflineBanner";
import { RouteError } from "@/components/RouteError";

export const Route = createFileRoute("/_protected/_main")({
    component: Layout,
    errorComponent: RouteError,
});

function Layout() {
    // Chat runs outlive the conversation route on purpose; leaving the app
    // shell (logout) is the one place they must not keep running.
    useEffect(() => abortAllChatRuns, []);

    return (
        <AiProvider>
            <div className="flex h-full flex-col bg-background">
                <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
                >
                    跳到主要内容
                </a>
                {/* A stable key for TanStack Router scroll restoration. Its
                    default nth-child path shifts while a Radix dialog adds
                    focus-guard spans to <body>, which made every sheet close
                    snap this container back to the top. */}
                <main
                    id="main-content"
                    tabIndex={-1}
                    data-scroll-restoration-id="main-content"
                    className="flex-1 overflow-auto overscroll-contain outline-none"
                >
                    <Outlet />
                </main>

                <OfflineBanner />
                <NavButtons />
            </div>
        </AiProvider>
    );
}
