import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import { RouteError, RouteNotFound } from "@/components/RouteError";
import { Toaster } from "@/components/ui/sonner";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import type { AuthStore } from "@/lib/auth-store";

import "@/globals.css";

function RootComponent() {
    useVisualViewport();

    return (
        <>
            <Outlet />
            <Toaster />
        </>
    );
}

export const Route = createRootRouteWithContext<{
    auth: AuthStore;
    queryClient: QueryClient;
}>()({
    component: RootComponent,
    errorComponent: RouteError,
    notFoundComponent: RouteNotFound,
});
