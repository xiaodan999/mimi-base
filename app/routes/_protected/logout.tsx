import { Button } from "@/components/ui/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "../_protected";

export const Route = createFileRoute("/_protected/logout")({
	preload: false,
	component: Page,
});

function Page() {
	const { logout } = useAuth();
	const navigate = useNavigate();
	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useEffect(() => {
		logout().then(({ error }) => {
			if (!error) {
				navigate({ to: "/" });
			}
		});
	}, []);
	return (
		<div>
			<h1>Bye bye...</h1>
			<Button
				onClick={() => {
					logout();
				}}
			>
				Logout
			</Button>
		</div>
	);
}
