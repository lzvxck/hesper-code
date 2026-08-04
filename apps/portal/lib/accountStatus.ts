import { type Plan, type SubscriptionStatus, toPlan, toSubscriptionStatus } from "@seri/plans";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountStatus = { plan: Plan | null; status: SubscriptionStatus | null };

/*
 * Read-only, deliberately. The Polar webhook in apps/server is the single writer of
 * account_status; adding a second writer here is the obvious-looking change that produces
 * two writers with schemas that drift apart the first time either one is extended.
 *
 * The portal does write to Supabase — but only to `provisioning_claims`, which it owns
 * outright. That is not a precedent for writing here: this table stays single-writer.
 *
 * Both columns are text in the database, so both are parsed against the shared unions the
 * webhook writes from. A value outside them — an unmapped product, a status from a schema
 * this deployment predates — reads back as null rather than being passed on as a string
 * nobody checked.
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
  return { plan: toPlan(data.plan), status: toSubscriptionStatus(data.subscription_status) };
}
