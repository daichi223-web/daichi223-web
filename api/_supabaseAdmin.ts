// Server-only: Supabase service-role client.
// Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env (set in Vercel).
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error("SUPABASE_URL is not set");
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

export const supabaseAdmin: SupabaseClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
