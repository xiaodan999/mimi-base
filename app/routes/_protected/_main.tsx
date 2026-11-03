import { Outlet, createFileRoute } from "@tanstack/react-router";

import NavButtons from "@/components/NavButtons";
import { RouteError } from "@/components/RouteError";

export const Route = createFileRoute("/_protected/_main")({
    component: Layout,
    errorComponent: RouteError,
});

function Layout() {
    return (
        <div className="flex h-full flex-col bg-background">
            <main className="flex-1 overflow-auto overscroll-contain">
                <Outlet />
            </main>

            <NavButtons />
        </div>
    );
}
