import { useEffect } from "react";
import {
    Outlet,
    createFileRoute,
    redirect,
    useRouter,
} from "@tanstack/react-router";

import LoadingPage from "@/components/LoadingPage";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_protected")({
    beforeLoad: async ({ context, location }) => {
        if (context.auth.loading) return;

        if (!context.auth.isAuthenticated) {
            throw redirect({
                to: "/login",
                search: {
                    redirect: location.href,
                },
            });
        }
    },
    component: function Component() {
        const router = useRouter();
        const { loading, isAuthenticated } = useAuth();

        useEffect(() => {
            if (!loading) router.invalidate();
        }, [loading, router]);
        if (isAuthenticated) return <Outlet />;

        return loading ? <LoadingPage /> : <Outlet />;
    },
});
