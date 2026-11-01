import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AiProvider } from "@/app/study/ai/AiContext";
import NavButtons from "@/components/NavButtons";

export const Route = createFileRoute("/_protected/_main")({
    component: Layout,
});

function Layout() {
    return (
        <AiProvider>
            <div className="flex h-full flex-col">
                <main className="flex-1 overflow-auto">
                    <Outlet />
                </main>

                <NavButtons />
            </div>
        </AiProvider>
    );
}
