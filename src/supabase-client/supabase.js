import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://yibqpulkysphrlwghrxe.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpYnFwdWxreXNwaHJsd2docnhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE2Nzk5MjcyODgsImV4cCI6MTk5NTUwMzI4OH0.sVd5fh-HrKc51m3eQNQrvZcdh-egNF4-wTRxwlpziDs";
const supabase = createClient(supabaseUrl, supabaseKey);
export default supabase;
