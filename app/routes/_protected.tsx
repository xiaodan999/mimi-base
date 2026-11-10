import {
    createFileRoute,
    Navigate,
    Outlet,
    redirect,
    useLocation,
} from "@tanstack/react-router";

import LoadingPage from "@/components/LoadingPage";
import { ensureDevSession, useAuth } from "@/lib/auth";
import { hrefWithoutDev, toLoginTarget } from "@/lib/redirect";

export const Route = createFileRoute("/_protected")({
    beforeLoad: async ({ context, location }) => {
        const devKey = new URLSearchParams(location.searchStr).get("dev");
        // The destination with `?dev=` already stripped. Both the sign-in
        // return and the login redirect use it, so the key never comes back.
        const target = hrefWithoutDev(location);

        if (devKey) {
            // Dev-only shortcut: `/jizhang?dev=test` signs in as that account
            // and then replaces the URL with `/jizhang`.
            if ((await ensureDevSession(context.auth, devKey)).ok) {
                throw redirect({ href: target, replace: true });
            }
        }

        const { status } = await context.auth.waitForAuth();
        if (status !== "authenticated") {
            throw redirect({
                to: "/login",
                search: {
                    // `toLoginTarget` keeps `/login` and off-site values out
                    // of this field; a login URL used as its own target nests
                    // on every render.
                    redirect: toLoginTarget(target, window.location.origin),
                },
            });
        }

        if (devKey) {
            // The key was unknown (or sign-in failed) but the session is
            // fine: keep the page and just drop the junk param.
            throw redirect({ href: target, replace: true });
        }
    },
    component: function Component() {
        const { status } = useAuth();
        const location = useLocation();

        if (status === "authenticated") return <Outlet />;
        if (status === "loading") return <LoadingPage />;

        // `beforeLoad` only runs on navigation, so a session that ends while
        // this layout is mounted (logout in another tab, expired token) has
        // to redirect from here as well.
        return (
            <Navigate
                to="/login"
                search={{
                    redirect: toLoginTarget(
                        hrefWithoutDev(location),
                        window.location.origin,
                    ),
                }}
                replace
            />
        );
    },
});
