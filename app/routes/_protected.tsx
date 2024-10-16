import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";

type User = {
	id: string;
	user_name: string;
	tou_xiang: string;
	circle: string;
};

export const Route = createFileRoute("/_protected")({
	beforeLoad: async ({ location }) => {
		const user = await fetchUser();
		if (!user) {
			if (location.pathname === "/login")
				return {
					auth: {
						isAuthenticated: false,
					},
				};

			throw redirect({
				to: "/login",
				search: {
					redirect: location.href,
				},
			});
		}

		return {
			auth: {
				isAuthenticated: !!user.id,
				...user,
			},
		};
	},
});

const fetchUser = createServerFn("GET", async () => {
	const supabase = getSupabaseServerClient();
	const {
		data: { session },
	} = await supabase.auth.getSession();
	if (!session) return null;
	const { data, error } = await supabase.auth.getUser();

	if (!data.user?.email || error) {
		return null;
	}

	const { data: userData, error: userError } = await supabase
		.from("users")
		.select("id,user_name,tou_xiang,tou-xiang-circle(url)")
		.eq("id", data.user.id)
		.single();

	if (userError) return null;

	return {
		id: userData.id,
		user_name: userData.user_name,
		tou_xiang: userData.tou_xiang,
		circle: userData["tou-xiang-circle"]?.url,
	} as User;
});
