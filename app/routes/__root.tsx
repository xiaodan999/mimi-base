// app/routes/__root.tsx
import ENV from "@/lib/env";
import { createRootRoute } from "@tanstack/react-router";

import { Outlet, ScrollRestoration } from "@tanstack/react-router";
import { Body, Head, Html, Meta, Scripts } from "@tanstack/start";
import appCss from "globals.css?url";
import { Suspense, lazy } from "react";

const TanStackRouterDevtools =
	ENV.ENV === "production"
		? () => null // Render nothing in production
		: lazy(() =>
				// Lazy load in development
				import("@tanstack/router-devtools").then((res) => ({
					default: res.TanStackRouterDevtools,
					// For Embedded Mode
					// default: res.TanStackRouterDevtoolsPanel
				})),
			);

export const Route = createRootRoute({
	meta: () => [
		{
			charSet: "utf-8",
		},
		{
			name: "theme-color",
			content: "#c4f2d0",
		},
		{
			name: "viewport",
			content: "width=device-width, initial-scale=1",
		},
		{
			title: "小蛋🏡的秘密基地",
		},
	],
	links: () => [
		{
			rel: "icon",
			href: "/images/logo512.png",
		},
		{ rel: "manifest", href: "/manifest.json" },
		{ rel: "stylesheet", href: appCss },
	],
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
			<Suspense>
				<TanStackRouterDevtools />
			</Suspense>
		</RootDocument>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<Html>
			<Head>
				<Meta />
			</Head>
			<Body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</Body>
		</Html>
	);
}