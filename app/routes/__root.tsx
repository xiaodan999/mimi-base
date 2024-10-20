import { Toaster } from "@/components/ui/sonner";
import {
	Outlet,
	ScrollRestoration,
	createRootRouteWithContext,
} from "@tanstack/react-router";
import { lazy } from "react";

import "globals.css";
import type { AuthContextType } from "@/lib/auth";
import type { QueryClient } from "@tanstack/react-query";

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
export const Route = createRootRouteWithContext<{
	auth: AuthContextType;
	queryClient: QueryClient;
}>()({
	component: () => (
		<>
			<Outlet />
			<ScrollRestoration getKey={(location) => location.pathname} />
			<Toaster />

			<TanStackRouterDevtools position="bottom-right" />
		</>
	),
});
