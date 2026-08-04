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
 * account_status holds one row per customer (onConflict: workos_user_id), but the design
 * deliberately gives a paying customer *two* Polar subscriptions: the API-created Free one,
 * which nothing cancels, plus the paid one. Both emit webhooks and both would upsert this
 * single row, so whichever event lands last wins — and a Free renewal landing after a paid
 * event rewrites a Max customer as plan="free". The portal then reads "free", offers the
 * upgrade button, and /api/checkout refuses it with a 409 because Polar still shows the paid
 * subscription. The customer is left with no working action at all.
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
