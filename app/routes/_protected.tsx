import {
    createFileRoute,
    Navigate,
    Outlet,
    redirect,
    useLocation,
} from "@tanstack/react-router";

import LoadingPage from "@/components/LoadingPage";
import { ensureDevSession, useAuth } from "@/lib/auth";
import { toLoginTarget } from "@/lib/redirect";

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
                    // The current location can already be /login while a
                    // transition settles. Using it as the post-login target
                    // turns every render into `/login?redirect=/login...`.
                    redirect: toLoginTarget(target, window.location.origin),
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
        //
        // While a transition is still in flight the router can render this
        // layout after the URL already became /login. Navigating again from
        // here would redirect /login to itself and keep nesting the login URL
        // (`/login?redirect=/login?redirect=...`), so let it settle instead.
        if (location.pathname === "/login") return null;

        const params = new URLSearchParams(location.searchStr);
        params.delete("dev");
        return (
            <Navigate
                to="/login"
                search={{
                    redirect: toLoginTarget(
                        withoutDev(location, params),
                        window.location.origin,
                    ),
                }}
                replace
            />
        );
    },
});
