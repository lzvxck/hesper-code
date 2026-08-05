import { PAID_PLANS, type Plan, type SubscriptionStatus, isPaidPlan } from "@seri/plans";
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
  /**
   * The subscription's own amount, in cents. Zero identifies the free tier without consulting
   * this deployment's product configuration — see the ordering guard below.
   */
  amount: number;
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

  /*
   * Keyed on the amount, not on the plan, and that distinction is the whole guard.
   *
   * `plan` stops being trustworthy in exactly the situation this protects against: `toPlan()`
   * returns null whenever a `POLAR_PRODUCT_*` is unset or has been rotated, so the free
   * subscription's revoke — the one createCheckout fires on the way into an upgrade — stops
   * looking free and takes the unconditional branch straight over a paying customer's row.
   * A rule that fails open on misconfiguration is not a rule.
   *
   * `amount` is on every subscription payload and owes nothing to this deployment's
   * configuration, so it still identifies the zero-cost tier when the product mapping has
   * fallen over.
   *
   * The portal's `revokeFreeSubscription` tests the amount too, and it is worth being exact
   * about how the two differ rather than calling them the same rule. That one has to *select*
   * a subscription to destroy, so it finds it by product mapping and treats a non-zero amount
   * as a veto. This one only has to *classify* an event that already arrived, so it starts
   * from the amount and treats a paid label as a veto. Neither is derived from the other, and
   * they are deliberately not shared: a selector and a classifier that happen to mention the
   * same field are not one predicate, and merging them would put the product mapping — the
   * thing this branch exists to stop depending on — back into the classifier.
   *
   * The plan check is not redundant with it, and this is the part that is *not* measured: what
   * Polar reports in `amount` for a discounted, trialing or zero-priced paid subscription has
   * not been established here, and `Subscription` carries `discount` separately, so a paid
   * subscription reading 0 is possible. Were that to happen with only the amount test, its
   * revoke would take the conditional path, fail to match its own active row, and strand a
   * churned customer as active forever. Anything labelled paid therefore wins outright, and
   * the conditional path is left holding only what is both zero-cost and not a paid tier.
   *
   * Two states this still cannot repair, both configuration rather than races, and both in the
   * deploy runbook. A deployment with *no* product ids writes every row with plan null, so
   * `plan.is.null` matches and the filter admits everything. And a rotated id puts the paid
   * label out of reach exactly when the amount test would need it: a zero-amount paid
   * subscription whose product no longer maps arrives as `plan: null, amount: 0`, takes the
   * conditional path, fails to match its own active row, and its revoke is dropped. Setting
   * the product ids correctly is the fix for both; nothing here can substitute for it.
   */
  if (params.amount !== 0 || isPaidPlan(params.plan)) {
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
