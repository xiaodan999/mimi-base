import { createFileRoute } from "@tanstack/react-router";
import XiaohaiTab from "@/components/XiaohaiTab"
export const Route = createFileRoute("/_protected/home")({
	component: Page,
	beforeLoad: ({ context }) => {
		console.log("context in home", context);
	},
});

function Page() {
	const data = Route.useRouteContext();
	return (
		<div>
			Home page {JSON.stringify(data)}
			<XiaohaiTab />
		</div>
	);
}
