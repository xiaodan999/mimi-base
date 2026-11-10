import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_main/study")({
    component: Layout,
});

/** The AI provider now lives in the app shell, shared by every page. */
function Layout() {
    return <Outlet />;
}
