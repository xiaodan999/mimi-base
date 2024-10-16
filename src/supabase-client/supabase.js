import { createClient } from "@supabase/supabase-js";

const supabase = createClient("supabaseUrl", "supabaseKey");
export default supabase;
