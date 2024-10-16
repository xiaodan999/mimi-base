import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";

export const logoutFn = createServerFn("POST", async () => {
	const supabase = getSupabaseServerClient();
	const { error } = await supabase.auth.signOut();

	if (error) {
		return {
			error: true,
			message: error.message,
		};
	}

	throw redirect({
		href: "/",
	});
});

export const Route = createFileRoute("/logout")({
	preload: false,
	loader: () => logoutFn(),
});
