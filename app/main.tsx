import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import LoadingPage from "@/components/LoadingPage";
import { RouteError } from "@/components/RouteError";
import { AuthProvider, useAuth } from "@/lib/auth";
import { registerServiceWorker } from "@/lib/service-worker";
import { ThemeProvider } from "@/lib/theme";

import { routeTree } from "./routeTree.gen";

export const queryClient = new QueryClient();

// Set up a Router instance
const router = createRouter({
    routeTree,
    context: {
        queryClient,
        auth: null!,
    },
    defaultPreload: "intent",
    // Since we're using React Query, we don't want loader calls to ever be stale
    // This will ensure that the loader is always called when the route is preloaded or visited
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: LoadingPage,
    defaultErrorComponent: RouteError,
});
// Register things for typesafety
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

function InnerApp() {
    const auth = useAuth();

    return (
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} context={{ auth }} />
        </QueryClientProvider>
    );
}

function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <InnerApp />
            </AuthProvider>
        </ThemeProvider>
    );
}

const rootElement = document.getElementById("app")!;

if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<App />);
}

if (import.meta.env.PROD) {
    registerServiceWorker();
}
