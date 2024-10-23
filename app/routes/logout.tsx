import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/logout")({
	preload: false,
	component: Page,
});

function Page() {
	const { logout } = useAuth();
	const navigate = useNavigate();

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useEffect(() => {
		logout().then(() => {
			navigate({ to: "/" });
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
