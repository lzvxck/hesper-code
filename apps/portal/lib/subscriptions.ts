import { type PaidPlan, type ProductEnv, isPaidPlan, planForProductId } from "@seri/plans";

/*
 * The fields of Polar's CustomerStateSubscription this app actually reads. Structural
 * rather than the SDK type so a test can build one without inventing twenty timestamps.
 */
export type ActiveSubscription = {
  id: string;
  productId: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
};

/*
 * Polar allows one customer to hold several active subscriptions at once, does not specify
 * the order of `activeSubscriptions`, and does not cancel the API-created Free subscription
 * when a paid checkout completes. So the account's real plan is the paid subscription if
 * there is one — picking [0] would be a coin flip between Free and Pro.
 */
export function paidSubscription(
  subscriptions: ActiveSubscription[],
  env: ProductEnv,
): { subscription: ActiveSubscription; plan: PaidPlan } | null {
  for (const subscription of subscriptions) {
    const plan = planForProductId(subscription.productId, env);
    if (isPaidPlan(plan)) return { subscription, plan };
  }
  return null;
}

/*
 * "Everything this account holds is the configured free product."
 *
 * One predicate for two decisions that must agree: what plan the page reports, and whether
 * a checkout is allowed. They used to differ — the page said "free" if *any* free
 * subscription was present, while checkout refused if *any* subscription failed to map to
 * free. Rotate a product id and the page rendered "You're on free" above buttons that all
 * came back 409.
 *
 * Vacuously true for an account with no subscriptions, which is exactly right for both
 * callers: nothing to report, and nothing blocking a first checkout.
 */
export function holdsOnlyFree(subscriptions: ActiveSubscription[], env: ProductEnv): boolean {
  return subscriptions.every((s) => planForProductId(s.productId, env) === "free");
}
