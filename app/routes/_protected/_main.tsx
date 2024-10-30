import { Outlet, createFileRoute } from "@tanstack/react-router";

import NavButtons from "@/src/components/NavButtons";

export const Route = createFileRoute("/_protected/_main")({
    component: Layout,
});

function Layout() {
    return (
        <div className="flex h-full flex-col">
            <main className="flex-1 overflow-auto">
                <Outlet />
            </main>

            <NavButtons />
        </div>
    );
}
