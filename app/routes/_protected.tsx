import {
    Navigate,
    Outlet,
    createFileRoute,
    redirect,
    useLocation,
} from "@tanstack/react-router";

import LoadingPage from "@/components/LoadingPage";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_protected")({
    beforeLoad: async ({ context, location }) => {
        const { status } = await context.auth.waitForAuth();
        if (status !== "authenticated") {
            throw redirect({
                to: "/login",
                search: {
                    redirect: location.href,
                },
            });
        }
    },
    component: function Component() {
        const { status } = useAuth();
        const location = useLocation();

        if (status === "authenticated") return <Outlet />;
        if (status === "loading") return <LoadingPage />;

        // The session can end after the guard ran (expired token, logout in
        // another tab). Send the user back to login instead of a blank screen.
        return (
            <Navigate
                to="/login"
                search={{ redirect: location.href }}
                replace
            />
        );
    },
});
