// @ts-nocheck

import supabase from "@/lib/supabase-client";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { useRouter } from "@tanstack/react-router";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";
import { useEffect } from "react";

type User = {
	id: string;
	user_name: string;
	tou_xiang: string;
	circle: string;
};

export const Route = createFileRoute("/_protected")({
	beforeLoad: async ({ location }) => {
		if (location.pathname === "/logout") {
			return {
				auth: {
					isAuthenticated: false,
				} as const,
			};
		}

		const user = await fetchUserFn();
		if (!user) {
			if (["/login"].includes(location.pathname))
				return {
					auth: {
						isAuthenticated: false,
					} as const,
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

	component: () => (
		<AuthStateListener>
			<Outlet />
		</AuthStateListener>
	),
});

const fetchUserFn = createServerFn("GET", async () => {
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

export function useAuth() {
	const auth = Route.useRouteContext({ select: (ctx) => ctx.auth });

	return {
		isAuthenticated: auth.isAuthenticated,
		user: auth.isAuthenticated ? { ...auth } : null,
		login: (credentials: {
			email: string;
			password: string;
		}) => {
			return supabase.auth.signInWithPassword(credentials);
		},
		logout: async () => {
			return await supabase.auth.signOut();
		},
	};
}

function AuthStateListener({ children }) {
	const router = useRouter();

	useEffect(() => {
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_OUT") {
				router.invalidate();
			}
		});
		return subscription.unsubscribe;
	}, [router]);

	return <>{children}</>;
}
