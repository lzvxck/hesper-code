import type { Polar } from "@polar-sh/sdk";
import type { CustomerState } from "@polar-sh/sdk/models/components/customerstate";
import { type Plan, type ProductEnv, productIdForPlan } from "@seri/plans";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAccountStatus } from "./accountStatus";
import { getCustomerState } from "./polar";
import type { SessionUser } from "./session";
import { holdsOnlyFree, paidSubscription } from "./subscriptions";

export type ProvisioningDeps = {
  supabase: SupabaseClient;
  polar: Polar;
  products: ProductEnv;
};

/*
 * Two simultaneous first visits both see "no customer" and both create one. Rather than
 * pattern-matching Polar's duplicate error — which is indistinguishable at a glance from
 * the 422 it returns for an undeliverable email — ask Polar again: if the customer is there
 * now, the failure was our own race and is success. If it is not, the error is real and has
 * to surface.
 */
async function ensureCustomer(polar: Polar, user: SessionUser): Promise<CustomerState | null> {
  const existing = await getCustomerState(polar, user.userId);
  if (existing) return existing;
  try {
    await polar.customers.create({ email: user.email, externalId: user.userId });
    return null;
  } catch (error) {
    const raced = await getCustomerState(polar, user.userId);
    if (!raced) throw error;
    return raced;
  }
}

/*
 * The same recovery as ensureCustomer, one step later, and the predicate differs on
 * purpose: there a customer either exists or does not, whereas here Polar has no
 * "subscription for this product" lookup, so the question that can actually be asked is
 * whether the customer now holds any active subscription at all. That is sound because
 * this only runs when the check above found none.
 */
async function ensureFreeSubscription(polar: Polar, userId: string, freeProductId: string): Promise<void> {
  try {
    await polar.subscriptions.create({ productId: freeProductId, externalCustomerId: userId });
  } catch (error) {
    const raced = await getCustomerState(polar, userId);
    if (!raced?.activeSubscriptions.length) throw error;
  }
}

/**
 * What the page needs to render an account.
 *
 * `plan` is null when Polar shows the account holding only products that are not among the
 * four configured ones — the one case where we genuinely cannot say what they are on.
 * `endsAt` is set only while a paid subscription is scheduled to cancel, and is the date
 * access actually stops.
 */
export type AccountPlan = { plan: Plan | null; endsAt: Date | null };

/**
 * Establishes a Polar customer and a Free subscription for a session, and reports the plan
 * that is now in force.
 */
export async function ensureProvisioned(deps: ProvisioningDeps, user: SessionUser): Promise<AccountPlan> {
  /*
   * Fast path: in steady state a page load reaches Supabase and stops there. All three
   * conditions are load-bearing. A revoked or past_due row would otherwise report the plan
   * the customer used to be on and route them at /api/plan, which cannot revive a canceled
   * subscription — leaving a churned customer with no way back to paying. And a row whose
   * `plan` is null says nothing at all; a deployment whose webhook predates that column
   * writes exactly that, and believing it would send a paying customer to checkout for a
   * second subscription.
   *
   * A scheduled cancellation cannot hide behind this path: the webhook writes "canceled" the
   * moment one is scheduled, so such an account always falls through to Polar, which is the
   * only place the end date exists.
   */
  const row = await readAccountStatus(deps.supabase, user.userId);
  if (row?.status === "active" && row.plan) return { plan: row.plan, endsAt: null };

  const freeProductId = productIdForPlan("free", deps.products);
  if (!freeProductId) throw new Error("POLAR_PRODUCT_FREE is not set");

  /*
   * Past that fast path, account_status is not authoritative: it is written asynchronously
   * by the Polar webhook, which can lag or fail. Idempotency is therefore anchored on Polar
   * — treating our own row as the answer would create a second subscription on every page
   * load while the webhook was behind.
   */
  const state = await ensureCustomer(deps.polar, user);
  const subscriptions = state?.activeSubscriptions ?? [];

  /*
   * Read by product rather than by position. Polar permits one active subscription per
   * customer, so this is the only one — an earlier design assumed Free ran alongside a paid
   * subscription, which a live checkout disproved.
   */
  const paid = paidSubscription(subscriptions, deps.products);
  if (paid) {
    const { cancelAtPeriodEnd, currentPeriodEnd } = paid.subscription;
    return { plan: paid.plan, endsAt: cancelAtPeriodEnd ? currentPeriodEnd : null };
  }

  // Active, but not on something we can fully account for. Adding a Free subscription on
  // top of a product we cannot identify risks charging twice, so report the uncertainty
  // rather than write — the same predicate createCheckout refuses on.
  if (subscriptions.length > 0) {
    return { plan: holdsOnlyFree(subscriptions, deps.products) ? "free" : null, endsAt: null };
  }

  /*
   * No active subscription. Three ways to arrive here, and this one branch repairs all of
   * them: a genuinely new customer; one whose paid subscription has lapsed after a downgrade
   * to Free, since Polar allows only one subscription at a time and nothing is left running
   * underneath; and one who abandoned a checkout after the free subscription was revoked to
   * make room for it. The last two are why this must stay reachable — it is the only path
   * back to Free.
   */
  await ensureFreeSubscription(deps.polar, user.userId, freeProductId);

  // Returned rather than re-read: the webhook that writes the row has not necessarily
  // arrived yet, and only later visits depend on it.
  return { plan: "free", endsAt: null };
}
