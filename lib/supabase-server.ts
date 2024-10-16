import { createServerClient } from "@supabase/ssr";
import { parseCookies, setCookie } from "vinxi/http";
import ENV from "./env";

export function getSupabaseServerClient() {
	return createServerClient(ENV.SUPABASE_URL, ENV.SUPABASE_PUBLISHABLE_KEY, {
		cookies: {
			// @ts-ignore Wait till Supabase overload works
			getAll() {
				return Object.entries(parseCookies()).map(([name, value]) => ({
					name,
					value,
				}));
			},
			setAll(cookies) {
				// biome-ignore lint/complexity/noForEach: copied code
				cookies.forEach((cookie) => {
					setCookie(cookie.name, cookie.value);
				});
			},
		},
	});
}
