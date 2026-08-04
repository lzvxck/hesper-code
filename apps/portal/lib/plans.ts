export const PLANS = ["free", "pro", "max", "ultra"] as const;
export type Plan = (typeof PLANS)[number];

// The plans a request may ask for. "free" is absent on purpose: it is provisioned by API on
// first login and never bought, and going back to it is a cancellation, which belongs to
// Polar's customer portal.
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
