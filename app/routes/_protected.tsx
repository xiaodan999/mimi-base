import LoadingPage from "@/components/LoadingPage";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

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
		const loading = Route.useRouteContext({
			select: (ctx) => ctx.auth.loading,
		});
		return loading ? <LoadingPage /> : <Outlet />;
	},
});
