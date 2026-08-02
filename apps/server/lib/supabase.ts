import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
