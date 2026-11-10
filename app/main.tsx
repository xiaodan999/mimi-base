import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";
import ReactDOM from "react-dom/client";

import LoadingPage from "@/components/LoadingPage";
import { RouteError } from "@/components/RouteError";
import { auth } from "@/lib/auth";
import { reloadOnce } from "@/lib/chunk-load-error";
import { registerServiceWorker } from "@/lib/service-worker";
import { ThemeProvider } from "@/lib/theme";

import { routeTree } from "./routeTree.gen";

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // PocketBase realtime (useRealtimeSync) invalidates the relevant
            // prefixes on every write, so cached data is normally fresh.
            // staleTime 0 is the safety net for anything the socket missed
            // (phone suspended, tab restored): mount/focus/reconnect refetch
            // instead of showing the previous device's data. Queries that
            // would refetch several pages at once keep a longer explicit
            // staleTime (the feed) to avoid request storms.
            staleTime: 0,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            // PocketBase throws ClientResponseError with a `status`; 4xx
            // (auth/validation/not-found) can never succeed on a retry.
            retry: (failureCount, error) => {
                const status = (error as { status?: number }).status;
                if (
                    typeof status === "number" &&
                    status >= 400 &&
                    status < 500
                ) {
                    return false;
                }
                return failureCount < 3;
            },
        },
    },
});

// Restore the session in parallel with the first route load. Guards await
// `waitForAuth()`, which joins this read instead of branching on "loading".
void auth.hydrate();

// Set up a Router instance. The context holds the singleton auth store, so it
// never changes identity: auth updates reach components through `useAuth()`,
// never by re-creating the router context.
const router = createRouter({
    routeTree,
    context: {
        queryClient,
        auth,
    },
    defaultPreload: "intent",
    // Since we're using React Query, we don't want loader calls to ever be stale
    // This will ensure that the loader is always called when the route is preloaded or visited
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: LoadingPage,
    defaultErrorComponent: RouteError,
    // The app scrolls inside <main id="main-content">, not the window. Keying
    // by URL instead of history entry means the bottom nav restores each tab's
    // position too, not just back/forward navigation.
    scrollRestoration: true,
    scrollToTopSelectors: ["#main-content"],
    getScrollRestorationKey: (location) =>
        `${location.pathname}${location.searchStr}`,
});
// Register things for typesafety
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

function App() {
    // The static splash in index.html covers the first paint; hand the
    // screen over once React has committed the first frame.
    useEffect(() => {
        document.getElementById("boot-splash")?.remove();
    }, []);

    return (
        <ThemeProvider>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </ThemeProvider>
    );
}

const rootElement = document.getElementById("app")!;

if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<App />);
}

// A route chunk that fails to preload would leave the tab referencing assets
// the current deploy no longer has; reload once to pick up the new hashes.
window.addEventListener("vite:preloadError", (event) => {
    if (reloadOnce()) event.preventDefault();
});

if (import.meta.env.PROD) {
    registerServiceWorker();
}
