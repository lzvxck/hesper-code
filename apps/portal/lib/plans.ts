export const PLANS = ["free", "pro", "max", "ultra"] as const;
export type Plan = (typeof PLANS)[number];

/*
 * The plans a request may ask for. "free" is absent on purpose: it is provisioned by API on
 * first login and never bought, and going back to it is a cancellation, which belongs to
 * Polar's customer portal.
 *
 * Ascending price order, which is what makes an upgrade and a downgrade distinguishable.
 */
export const PAID_PLANS = ["pro", "max", "ultra"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

const PRODUCT_ENV_VAR: Record<Plan, string> = {
  free: "POLAR_PRODUCT_FREE",
  pro: "POLAR_PRODUCT_PRO",
  max: "POLAR_PRODUCT_MAX",
  ultra: "POLAR_PRODUCT_ULTRA",
};

/*
 * Product ids differ between the Polar sandbox and production, so they are configuration
 * rather than constants — and they are read through an injected record rather than
 * process.env so a test never has to set an environment variable to exercise the mapping.
 */
export type ProductEnv = Record<string, string | undefined>;

export function isPaidPlan(value: unknown): value is PaidPlan {
  return typeof value === "string" && (PAID_PLANS as readonly string[]).includes(value);
}

export function toPlan(value: unknown): Plan | null {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value) ? (value as Plan) : null;
}

export function productIdForPlan(plan: Plan, env: ProductEnv): string | null {
  return env[PRODUCT_ENV_VAR[plan]] ?? null;
}

export function planForProductId(productId: string, env: ProductEnv): Plan | null {
  return PLANS.find((plan) => env[PRODUCT_ENV_VAR[plan]] === productId) ?? null;
}

export function isUpgrade(from: PaidPlan, to: PaidPlan): boolean {
  return PAID_PLANS.indexOf(to) > PAID_PLANS.indexOf(from);
}

export type ActiveSubscription = { id: string; productId: string };

/*
 * Polar allows one customer to hold several active subscriptions at once, does not specify
 * the order of `activeSubscriptions`, and does not cancel the API-created Free subscription
 * when a paid checkout completes. So the account's real plan is the paid subscription if
 * there is one — picking [0] would be a coin flip between Free and Pro.
 */
export function paidSubscription<T extends ActiveSubscription>(
  subscriptions: T[],
  env: ProductEnv,
): { subscription: T; plan: PaidPlan } | null {
  for (const subscription of subscriptions) {
    const plan = planForProductId(subscription.productId, env);
    if (isPaidPlan(plan)) return { subscription, plan };
  }
  return null;
}

export function freeSubscription<T extends ActiveSubscription>(subscriptions: T[], env: ProductEnv): T | null {
  return subscriptions.find((s) => planForProductId(s.productId, env) === "free") ?? null;
}
