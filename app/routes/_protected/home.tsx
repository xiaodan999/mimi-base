import XiaohaiTab from "@/components/XiaohaiTab";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/home")({
	component: Page,
});

function Page() {
	return (
		<div>
			<XiaohaiTab />
		</div>
	);
}
