import NavButtons from "@/src/components/NavButtons";
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_main")({
	component: Layout,
});

function Layout() {
	return (
		<>
			<main>
				<Outlet />
			</main>

			<NavButtons />
		</>
	);
}
