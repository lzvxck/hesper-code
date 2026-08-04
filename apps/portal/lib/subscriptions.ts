import type { Polar } from "@polar-sh/sdk";
import { type PaidPlan, type ProductEnv, isPaidPlan, planForProductId } from "@seri/plans";

/*
 * The fields of Polar's CustomerStateSubscription this app actually reads. Structural
 * rather than the SDK type so a test can build one without inventing twenty timestamps.
 */
export type ActiveSubscription = {
  id: string;
  productId: string;
  amount: number;
  cancelAtPeriodEnd: boolean;
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

export function freeSubscription(
  subscriptions: ActiveSubscription[],
  env: ProductEnv,
): ActiveSubscription | null {
  return subscriptions.find((s) => planForProductId(s.productId, env) === "free") ?? null;
}

/*
 * Nothing on Polar's side cancels the API-created Free subscription when a paid one starts,
 * and this codebase has no way to verify whether that will ever change — so the account is
 * left holding both until we clear it ourselves.
 *
 * Three preconditions, because this is irreversible: a paid subscription must be positively
 * identified, the victim must map to the configured free product, and it must actually cost
 * nothing. The last one is the backstop for a POLAR_PRODUCT_FREE pointed at a paid product
 * by mistake — without it a configuration typo cancels a subscription somebody is paying
 * for.
 *
 * A failure is logged rather than propagated: this is bookkeeping, and it must never be the
 * reason a page render or a plan change fails.
 */
export async function revokeSupersededFree(
  polar: Polar,
  subscriptions: ActiveSubscription[],
  products: ProductEnv,
): Promise<void> {
  if (!paidSubscription(subscriptions, products)) return;
  const free = freeSubscription(subscriptions, products);
  if (!free || free.amount !== 0) return;
  try {
    await polar.subscriptions.revoke({ id: free.id });
  } catch (error) {
    console.warn(`Could not revoke superseded free subscription ${free.id}:`, error);
  }
}
