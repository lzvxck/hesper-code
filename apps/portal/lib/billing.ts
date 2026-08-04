import type { Polar } from "@polar-sh/sdk";
import type { SubscriptionUpdate } from "@polar-sh/sdk/models/components/subscriptionupdate";
import { type ProductEnv, isPaidPlan, isUpgrade, productIdForPlan, toPlan } from "@seri/plans";
import { getCustomerState, polarStatusCode } from "./polar";
import { type ActiveSubscription, holdsOnlyFree, paidSubscription } from "./subscriptions";

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
 * These used to say "resume it under Manage billing". That was tried against the real
 * customer portal and it offers no such control, so the instruction was unfollowable. Resume
 * is an API call — PATCH with cancel_at_period_end false, measured returning 200 — so the
 * portal owns it now, at /api/resume, and this copy points there instead.
 */
const SCHEDULED_TO_CANCEL = "This plan is scheduled to end. Resume it first, then change plan.";
const SCHEDULED_TO_CANCEL_CHECKOUT =
  "This plan is scheduled to end. Resume it rather than starting a second subscription.";

// The 403 backstop for the window between our read and the write, where the customer could
// have ended the subscription in Polar meanwhile. Deliberately does not name a remedy that
// Manage billing cannot perform.
const ALREADY_ENDED = "This subscription has already ended. Start a new one to continue.";

function scheduledToCancel(subscriptions: ActiveSubscription[]): boolean {
  return subscriptions.some((s) => s.cancelAtPeriodEnd);
}

const ALREADY_PAID = "This account already has a paid subscription; change it under Manage billing.";

async function sessionPaidSubscription(deps: BillingDeps) {
  // Found from the session's external id, never from a subscription id in the request, and
  // by product rather than by position — the account also holds the free subscription.
  const state = await getCustomerState(deps.polar, deps.userId);
  return paidSubscription(state?.activeSubscriptions ?? [], deps.products);
}

async function applyUpdate(deps: BillingDeps, id: string, update: SubscriptionUpdate): Promise<Response> {
  try {
    await deps.polar.subscriptions.update({ id, subscriptionUpdate: update });
  } catch (error) {
    if (polarStatusCode(error) === 403) return new Response(ALREADY_ENDED, { status: 409 });
    throw error;
  }
  return seeOther("/");
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
  if (!holdsOnlyFree(subscriptions, deps.products)) {
    const message = scheduledToCancel(subscriptions) ? SCHEDULED_TO_CANCEL_CHECKOUT : ALREADY_PAID;
    return new Response(message, { status: 409 });
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
  const target = toPlan(plan);
  if (!target) return new Response("unknown plan", { status: 400 });

  const current = await sessionPaidSubscription(deps);
  if (!current) {
    return new Response("No paid subscription to change; upgrading from free goes through checkout.", {
      status: 409,
    });
  }

  /*
   * Down to Free is a cancellation of the paid subscription at the end of the period the
   * customer has already paid for — never a revoke, which would end it immediately and take
   * away access they bought.
   *
   * They land on Free with nothing further to do because the API-created free subscription
   * has been running underneath the paid one the whole time. That coexistence is load
   * bearing: anything that "tidies up" the free subscription while a paid one exists breaks
   * this landing and drops the customer to no subscription at all.
   */
  if (target === "free") {
    return applyUpdate(deps, current.subscription.id, { cancelAtPeriodEnd: true });
  }

  const productId = productIdForPlan(target, deps.products);
  if (!productId) return unconfigured(target);

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
  const prorationBehavior = isUpgrade(current.plan, target) ? "invoice" : "next_period";
  return applyUpdate(deps, current.subscription.id, { productId, prorationBehavior });
}

/*
 * The page's single entry point. One form, one action, four cards — so which mechanism a
 * given card needs is decided here rather than encoded in the markup, where it would be a
 * second copy of a rule this module already owns and could disagree with it.
 *
 * Down to Free and paid-to-paid are both subscription updates; a first purchase is the only
 * checkout, because the free subscription never took a card and Polar answers an update on
 * it with 402.
 */
export async function selectPlan(deps: BillingDeps, plan: unknown): Promise<Response> {
  const target = toPlan(plan);
  if (!target) return new Response("unknown plan", { status: 400 });
  if (target === "free" || (await sessionPaidSubscription(deps))) return changePlan(deps, target);
  return createCheckout(deps, target);
}

/*
 * Clears a scheduled cancellation. Measured against the sandbox: PATCH with
 * cancel_at_period_end false returns 200 and the subscription goes back to renewing, and
 * the SDK's own SubscriptionCancel documents the field as doing exactly that ("Or uncancel
 * a subscription currently set to be revoked at period end").
 *
 * Takes nothing from the request at all — the subscription is whichever paid one the
 * session's Polar customer holds.
 */
export async function resumePaidPlan(deps: BillingDeps): Promise<Response> {
  const current = await sessionPaidSubscription(deps);
  if (!current) return new Response("No paid subscription to resume.", { status: 409 });
  return applyUpdate(deps, current.subscription.id, { cancelAtPeriodEnd: false });
}
