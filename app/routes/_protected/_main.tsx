import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AiProvider } from "@/app/ai/AiContext";
import NavButtons from "@/components/NavButtons";
import OfflineBanner from "@/components/OfflineBanner";
import { RouteError } from "@/components/RouteError";

export const Route = createFileRoute("/_protected/_main")({
    component: Layout,
    errorComponent: RouteError,
});

function Layout() {
    return (
        <AiProvider>
            <div className="flex h-full flex-col bg-background">
                <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
                >
                    跳到主要内容
                </a>
                <main
                    id="main-content"
                    tabIndex={-1}
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
