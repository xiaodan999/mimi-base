import { createClient } from "@supabase/supabase-js";

import ENV from "./env";

const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_PUBLISHABLE_KEY);

export default supabase;
