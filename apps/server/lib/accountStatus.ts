import { type Plan, type SubscriptionStatus, isPaidPlan } from "@seri/plans";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Both unions come from @seri/plans, the same module the portal parses this table back
 * through. `plan` used to be a bare `string` here — the single writer of the column having
 * the weakest type of anyone who touches it.
 */
export type AccountStatusUpsertParams = {
  workosUserId: string;
  email: string | null;
  polarCustomerId: string;
  status: SubscriptionStatus;
  plan: Plan | null;
};

export type StoredAccountStatus = { plan: string | null; subscription_status: string | null };

/*
 * account_status holds one row per customer (onConflict: workos_user_id), and events for
 * more than one subscription land in it.
 *
 * The original reason was an assumption — since disproved — that a Free subscription ran
 * alongside a paid one. Polar permits only one at a time, so this now guards a narrower but
 * still real ordering hazard: upgrading revokes the Free subscription immediately before the
 * paid one is created, so a `subscription.revoked` for the free product is in flight at the
 * same moment as the paid events. Arriving late, it would rewrite a paying customer as
 * plan="free", status="revoked".
 *
 * Paid is authoritative, so a free-product event is dropped whole — including its
 * subscription_status, which otherwise reports the *free* subscription's lifecycle for a
 * paid account.
 *
 * The `=== "active"` is what keeps churn working: a customer whose paid row reads
 * revoked/canceled/past_due must be able to fall back to free, so only an active paid row
 * blocks the write.
 */
export function shouldWrite(incoming: Plan | null, stored: StoredAccountStatus | null): boolean {
  if (incoming !== "free") return true;
  return !(isPaidPlan(stored?.plan) && stored?.subscription_status === "active");
}

async function readStored(
  supabase: SupabaseClient,
  workosUserId: string,
): Promise<StoredAccountStatus | null> {
  const { data, error } = await supabase
    .from("account_status")
    .select("plan, subscription_status")
    .eq("workos_user_id", workosUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertAccountStatus(
  supabase: SupabaseClient,
  params: AccountStatusUpsertParams,
): Promise<void> {
  const stored = await readStored(supabase, params.workosUserId);
  if (!shouldWrite(params.plan, stored)) {
    console.warn(
      `Polar webhook: dropping free-product event for ${params.workosUserId}, row holds active ${stored?.plan}`,
    );
    return;
  }

  const { error } = await supabase.from("account_status").upsert(
    {
      workos_user_id: params.workosUserId,
      email: params.email,
      polar_customer_id: params.polarCustomerId,
      subscription_status: params.status,
      plan: params.plan,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workos_user_id" },
  );
  if (error) throw error;
}
