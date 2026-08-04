import type { SupabaseClient } from "@supabase/supabase-js";
import { type Plan, toPlan } from "./plans";

export type AccountStatus = { plan: Plan | null; status: string };

/*
 * Read-only, deliberately. The Polar webhook in apps/server is the single writer of
 * account_status; adding a second writer here is the obvious-looking change that produces
 * two writers with schemas that drift apart the first time either one is extended.
 *
 * `plan` is text in the database, so a value that is not one of the four labels — an
 * unmapped product id, say — reads back as null rather than being trusted.
 */
export async function readAccountStatus(
  supabase: SupabaseClient,
  workosUserId: string,
): Promise<AccountStatus | null> {
  const { data, error } = await supabase
    .from("account_status")
    .select("plan, subscription_status")
    .eq("workos_user_id", workosUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { plan: toPlan(data.plan), status: data.subscription_status };
}
