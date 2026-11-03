import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AiProvider } from "@/app/study/ai/AiContext";

export const Route = createFileRoute("/_protected/_main/study")({
    component: Layout,
});

/**
 * The AI settings sheet and client only matter inside the study base, so keep
 * them out of the shell chunk that Home and the feed load.
 */
function Layout() {
    return (
        <AiProvider>
            <Outlet />
        </AiProvider>
    );
}
