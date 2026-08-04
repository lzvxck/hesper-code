import type { Polar } from "@polar-sh/sdk";
import { type ProductEnv, isPaidPlan, isUpgrade, paidSubscription, planForProductId, productIdForPlan } from "./plans";
import { getCustomerState, polarStatusCode, revokeSupersededFree } from "./polar";

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
    return new Response("This account already has a paid subscription; change it under Manage billing.", {
      status: 409,
    });
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
  await revokeSupersededFree(deps.polar, subscriptions, deps.products);

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
      return new Response("This subscription is canceled and cannot be changed; start a new one instead.", {
        status: 409,
      });
    }
    throw error;
  }
  return seeOther("/");
}
