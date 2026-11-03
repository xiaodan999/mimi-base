import { lazy } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
    Outlet,
    ScrollRestoration,
    createRootRouteWithContext,
} from "@tanstack/react-router";

import { RouteError, RouteNotFound } from "@/components/RouteError";
import { Toaster } from "@/components/ui/sonner";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import type { AuthContextType } from "@/lib/auth";

import "@/globals.css";

const TanStackRouterDevtools =
    process.env.NODE_ENV === "production"
        ? () => null // Render nothing in production
        : lazy(() =>
              // Lazy load in development
              import("@tanstack/router-devtools").then((res) => ({
                  default: res.TanStackRouterDevtools,
                  // For Embedded Mode
                  // default: res.TanStackRouterDevtoolsPanel
              })),
          );
function RootComponent() {
    useVisualViewport();

    return (
        <>
            <Outlet />
            <ScrollRestoration getKey={(location) => location.pathname} />
            <Toaster />

            <TanStackRouterDevtools position="bottom-right" />
        </>
    );
}

export const Route = createRootRouteWithContext<{
    auth: AuthContextType;
    queryClient: QueryClient;
}>()({
    component: RootComponent,
    errorComponent: RouteError,
    notFoundComponent: RouteNotFound,
});
