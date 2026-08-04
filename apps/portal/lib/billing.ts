import type { Polar } from "@polar-sh/sdk";
import { type ProductEnv, isPaidPlan, isUpgrade, planForProductId, productIdForPlan } from "@seri/plans";
import { getCustomerState, polarStatusCode } from "./polar";
import { type ActiveSubscription, paidSubscription, revokeSupersededFree } from "./subscriptions";

/*
 * `userId` is the AuthKit session's, supplied by the route. A plan label is the only thing
 * either of these functions takes from the request — a product id, a subscription id or an
 * account id read off the body, the query string or a header would be an IDOR, and with
 * Supabase Auth unused there is no auth.uid() and no RLS policy standing behind it.
 *
 * `origin` is this deployment's own origin, used to send the customer back here afterwards.
 */
export type BillingDeps = {
  polar: Polar;
  products: ProductEnv;
  userId: string;
  origin: string;
};

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

// The environment variable that is missing is logged, not returned: a 500 body is something
// a browser will display.
function unconfigured(plan: string): Response {
  console.error(`No Polar product id configured for plan "${plan}"`);
  return new Response("That plan is unavailable right now.", { status: 500 });
}

/*
 * Polar keeps a subscription that is only *scheduled* to cancel inside activeSubscriptions,
 * while our own row already reads "canceled" — the webhook's comment records that
 * `data.status` stays "active" through the whole notice period.
 *
 * Neither route can serve that account: an update answers 403 AlreadyCanceledSubscription,
 * and a checkout would sell a second subscription alongside the one still running. Both
 * therefore give the same instruction, and it is the only one that actually works — resume
 * it in Polar's portal. Telling them to "start a new one" or to "change it under Manage
 * billing" were two different impossible remedies.
 */
const SCHEDULED_TO_CANCEL =
  "This subscription is scheduled to cancel at the end of the period. Resume it under Manage billing, then change your plan.";

function scheduledToCancel(subscriptions: ActiveSubscription[]): boolean {
  return subscriptions.some((s) => s.cancelAtPeriodEnd);
}

const ALREADY_PAID = "This account already has a paid subscription; change it under Manage billing.";

export async function createCheckout(deps: BillingDeps, plan: unknown): Promise<Response> {
  if (!isPaidPlan(plan)) return new Response("unknown plan", { status: 400 });
  const productId = productIdForPlan(plan, deps.products);
  if (!productId) return unconfigured(plan);

  /*
   * A checkout creates a subscription unconditionally, so this first has to establish that
   * the customer is not already subscribed to something — otherwise an upgrade attempt by an
   * account whose plan we failed to recognize leaves them paying twice. The bar is
   * deliberately "holds nothing but the configured free product", which also covers a
   * product id this deployment has no variable for.
   */
  const state = await getCustomerState(deps.polar, deps.userId);
  const subscriptions = state?.activeSubscriptions ?? [];
  if (subscriptions.some((s) => planForProductId(s.productId, deps.products) !== "free")) {
    return new Response(scheduledToCancel(subscriptions) ? SCHEDULED_TO_CANCEL : ALREADY_PAID, { status: 409 });
  }

  /*
   * Free -> paid has to be a checkout rather than an update: PATCHing a free subscription to
   * a paid product answers 402 PaymentFailed: missing_payment_method, because the free
   * subscription is created by API and never takes a card.
   */
  const checkout = await deps.polar.checkouts.create({
    products: [productId],
    externalCustomerId: deps.userId,
    successUrl: `${deps.origin}/`,
  });
  return seeOther(checkout.url);
}

export async function changePlan(deps: BillingDeps, plan: unknown): Promise<Response> {
  if (!isPaidPlan(plan)) return new Response("unknown plan", { status: 400 });
  const productId = productIdForPlan(plan, deps.products);
  if (!productId) return unconfigured(plan);

  // Found from the session's external id, never from a subscription id in the request, and
  // by product rather than by position — the account may still be holding the free
  // subscription alongside the paid one.
  const state = await getCustomerState(deps.polar, deps.userId);
  const subscriptions = state?.activeSubscriptions ?? [];
  const current = paidSubscription(subscriptions, deps.products);
  if (!current) {
    return new Response("No paid subscription to change; upgrading from free goes through checkout.", {
      status: 409,
    });
  }

  // Ask before Polar 403s, so the answer can say what to do about it.
  if (current.subscription.cancelAtPeriodEnd) {
    return new Response(SCHEDULED_TO_CANCEL, { status: 409 });
  }

  /*
   * Per direction, not one setting for both. An upgrade is invoiced now, which is what the
   * customer just asked for. A downgrade takes effect at the end of the period they have
   * already paid for — docs-tmp/pricing-tiers.md states that as the product's position, and
   * an immediate negative proration would otherwise open a refund path nothing here has
   * measured.
   */
  const prorationBehavior = isUpgrade(current.plan, plan) ? "invoice" : "next_period";

  try {
    await deps.polar.subscriptions.update({
      id: current.subscription.id,
      subscriptionUpdate: { productId, prorationBehavior },
    });
  } catch (error) {
    /*
     * Measured against the sandbox: Polar answers 403 AlreadyCanceledSubscription for a
     * subscription that is canceled or merely scheduled to cancel. There is no way back
     * through update, only a new checkout, so this is the caller's problem to act on rather
     * than a server fault.
     */
    if (polarStatusCode(error) === 403) {
      return new Response(SCHEDULED_TO_CANCEL, { status: 409 });
    }
    throw error;
  }

  // Only now. Revoking is irreversible and the update above is not guaranteed to succeed —
  // doing this first would cancel the free fallback and then leave the account on the plan
  // it was already on.
  await revokeSupersededFree(deps.polar, subscriptions, deps.products);
  return seeOther("/");
}
