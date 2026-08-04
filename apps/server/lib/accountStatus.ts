import { PAID_PLANS, type Plan, type SubscriptionStatus } from "@seri/plans";
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

/*
 * account_status holds one row per customer (onConflict: workos_user_id), and events for more
 * than one subscription land in it.
 *
 * The hazard is an ordering one: upgrading revokes the Free subscription immediately before
 * the paid one is created, so a `subscription.revoked` for the free product is in flight at
 * the same moment as the paid events. Arriving late, it would rewrite a paying customer as
 * plan="free", status="revoked". Paid is authoritative, so a free-product event loses whole —
 * including its subscription_status, which otherwise reports the *free* subscription's
 * lifecycle for a paid account.
 *
 * `subscription_status.neq.active` is what keeps churn working: a customer whose paid row
 * reads revoked/canceled/past_due must be able to fall back to Free, so only an *active* paid
 * row wins. The two `is.null` clauses are not defensive padding — in SQL, `plan NOT IN
 * ('pro',…)` and `subscription_status <> 'active'` are both NULL rather than true when the
 * column is NULL, so without them a row with no plan yet would refuse every free event.
 *
 * This is expressed as a filter on the write rather than as a predicate over a row read
 * first, and that is the whole point. It used to be a read-then-upsert, which lost precisely
 * the race it was written for: the free handler could read the pre-upgrade row before the
 * paid handler's write committed, conclude it was safe, and then overwrite a paying customer.
 * A conditional UPDATE is evaluated against the row at write time, so no window exists.
 */
const NOT_ACTIVE_PAID = [
  `plan.not.in.(${PAID_PLANS.join(",")})`,
  "plan.is.null",
  "subscription_status.neq.active",
  "subscription_status.is.null",
].join(",");

export async function upsertAccountStatus(
  supabase: SupabaseClient,
  params: AccountStatusUpsertParams,
): Promise<void> {
  const row = {
    workos_user_id: params.workosUserId,
    email: params.email,
    polar_customer_id: params.polarCustomerId,
    subscription_status: params.status,
    plan: params.plan,
    updated_at: new Date().toISOString(),
  };

  // Paid — and an unresolved plan, which is not a free product and so is not what this rule
  // guards against — always wins, and needs no condition.
  if (params.plan !== "free") {
    const { error } = await supabase
      .from("account_status")
      .upsert(row, { onConflict: "workos_user_id" });
    if (error) throw error;
    return;
  }

  // Two statements, each atomic on its own: create the row if this customer has none, then
  // claim an existing one only if it is not an active paid row. Whichever way the two
  // handlers interleave, the paid write is the one that survives.
  const { error: insertError } = await supabase
    .from("account_status")
    .upsert(row, { onConflict: "workos_user_id", ignoreDuplicates: true });
  if (insertError) throw insertError;

  const { error } = await supabase
    .from("account_status")
    .update(row)
    .eq("workos_user_id", params.workosUserId)
    .or(NOT_ACTIVE_PAID);
  if (error) throw error;
}
