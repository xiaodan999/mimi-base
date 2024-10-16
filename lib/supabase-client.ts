import { createBrowserClient } from "@supabase/ssr";
import ENV from "./env";

const supabase = createBrowserClient(
	ENV.SUPABASE_URL,
	ENV.SUPABASE_PUBLISHABLE_KEY,
);

export default supabase;
