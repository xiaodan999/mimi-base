import {
    createFileRoute,
    Navigate,
    Outlet,
    redirect,
    useLocation,
} from "@tanstack/react-router";

import LoadingPage from "@/components/LoadingPage";
import { ensureDevSession, useAuth } from "@/lib/auth";

/** The current location without the dev-only `?dev=` key. */
function withoutDev(
    location: { pathname: string; hash: string },
    params: URLSearchParams,
) {
    const search = params.toString();
    const hash = location.hash ? `#${location.hash}` : "";
    return `${location.pathname}${search ? `?${search}` : ""}${hash}`;
}

export const Route = createFileRoute("/_protected")({
    beforeLoad: async ({ context, location }) => {
        const params = new URLSearchParams(location.searchStr);
        const devKey = params.get("dev");
        let target = location.href;

        if (devKey) {
            // Dev-only shortcut: `/jizhang?dev=test` signs in as that account
            // and then replaces the URL with `/jizhang`. The key is stripped
            // whether or not it resolves, so it never reaches the login form.
            params.delete("dev");
            target = withoutDev(location, params);
            if ((await ensureDevSession(context.auth, devKey)).ok) {
                throw redirect({ href: target, replace: true });
            }
        }

        const { status } = await context.auth.waitForAuth();
        if (status !== "authenticated") {
            throw redirect({
                to: "/login",
                search: {
                    redirect: target,
                },
            });
        }
        if (devKey) {
            // The key was unknown (or sign-in failed) but the session is fine:
            // keep the page and just remove the junk param from the URL.
            throw redirect({ href: target, replace: true });
        }
    },
    component: function Component() {
        const { status } = useAuth();
        const location = useLocation();

        if (status === "authenticated") return <Outlet />;
        if (status === "loading") return <LoadingPage />;

        // The session can end after the guard ran (expired token, logout in
        // another tab). Send the user back to login instead of a blank screen.
        const params = new URLSearchParams(location.searchStr);
        params.delete("dev");
        return (
            <Navigate
                to="/login"
                search={{ redirect: withoutDev(location, params) }}
                replace
            />
        );
    },
});
