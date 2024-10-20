import LoadingPage from "@/components/LoadingPage";
import { useAuth } from "@/lib/auth";
import {
	Outlet,
	createFileRoute,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_protected")({
	beforeLoad: async ({ context, location }) => {
		console.log("beforeLoad in /_protected", context.auth, location.pathname);
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
	component: () => {
		const router = useRouter();
		const { loading, isAuthenticated } = useAuth();

		useEffect(() => {
			if (!loading) router.invalidate();
		}, [loading, router]);

		const showLoading = !isAuthenticated && loading;

		return showLoading ? <LoadingPage /> : <Outlet />;
	},
});
