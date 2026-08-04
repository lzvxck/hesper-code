import type { Polar } from "@polar-sh/sdk";
import { type ProductEnv, isPaidPlan, productIdForPlan } from "./plans";

/*
 * `userId` is the AuthKit session's, supplied by the route. A plan label is the only thing
 * either of these functions takes from the request — a product id, a subscription id or an
 * account id read off the body, the query string or a header would be an IDOR, and with
 * Supabase Auth unused there is no auth.uid() and no RLS policy standing behind it.
 */
export type BillingDeps = {
  polar: Polar;
  products: ProductEnv;
  userId: string;
};

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function createCheckout(deps: BillingDeps, plan: unknown): Promise<Response> {
  if (!isPaidPlan(plan)) return new Response("unknown plan", { status: 400 });
  const productId = productIdForPlan(plan, deps.products);
  if (!productId) return new Response(`no product id configured for ${plan}`, { status: 500 });

  /*
   * Free -> paid has to be a checkout rather than an update: PATCHing a free subscription to
   * a paid product answers 402 PaymentFailed: missing_payment_method, because the free
   * subscription is created by API and never takes a card.
   */
  const checkout = await deps.polar.checkouts.create({
    products: [productId],
    externalCustomerId: deps.userId,
  });
  return seeOther(checkout.url);
}

export async function changePlan(deps: BillingDeps, plan: unknown): Promise<Response> {
  if (!isPaidPlan(plan)) return new Response("unknown plan", { status: 400 });
  const productId = productIdForPlan(plan, deps.products);
  if (!productId) return new Response(`no product id configured for ${plan}`, { status: 500 });

  // Found from the session's external id, never from a subscription id in the request.
  const state = await deps.polar.customers.getStateExternal({ externalId: deps.userId });
  const current = state.activeSubscriptions[0];
  if (!current) return new Response("no active subscription", { status: 409 });
  if (current.productId === productIdForPlan("free", deps.products)) {
    return new Response("upgrading from free goes through checkout", { status: 409 });
  }

  await deps.polar.subscriptions.update({
    id: current.id,
    subscriptionUpdate: { productId, prorationBehavior: "invoice" },
  });
  return seeOther("/");
}
