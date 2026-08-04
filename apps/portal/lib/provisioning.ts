import type { Polar } from "@polar-sh/sdk";
import type { CustomerState } from "@polar-sh/sdk/models/components/customerstate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAccountStatus } from "./accountStatus";
import { type Plan, type ProductEnv, planForProductId, productIdForPlan } from "./plans";
import type { SessionUser } from "./session";

export type ProvisioningDeps = {
  supabase: SupabaseClient;
  polar: Polar;
  products: ProductEnv;
};

// Polar answers a missing customer with 404; anything else is a real failure.
function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { statusCode?: unknown }).statusCode === 404;
}

async function customerState(polar: Polar, userId: string): Promise<CustomerState | null> {
  try {
    return await polar.customers.getStateExternal({ externalId: userId });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/*
 * Two simultaneous first visits both see "no customer" and both create one. Rather than
 * pattern-matching Polar's duplicate error — which is indistinguishable at a glance from
 * the 422 it returns for an undeliverable email — ask Polar again: if the customer is there
 * now, the failure was our own race and is success. If it is not, the error is real and has
 * to surface.
 */
async function ensureCustomer(polar: Polar, user: SessionUser): Promise<CustomerState | null> {
  const existing = await customerState(polar, user.userId);
  if (existing) return existing;
  try {
    await polar.customers.create({ email: user.email, externalId: user.userId });
    return null;
  } catch (error) {
    const raced = await customerState(polar, user.userId);
    if (!raced) throw error;
    return raced;
  }
}

/**
 * Establishes a Polar customer and a Free subscription for a session, and reports the plan
 * that is now in force.
 *
 * Returns null when the account is on a product that is not one of the four configured
 * ones — reporting "free" there would understate a paying customer's plan.
 */
export async function ensureProvisioned(deps: ProvisioningDeps, user: SessionUser): Promise<Plan | null> {
  // Fast path. In steady state a page load reaches Supabase and stops there.
  const row = await readAccountStatus(deps.supabase, user.userId);
  if (row) return row.plan;

  const freeProductId = productIdForPlan("free", deps.products);
  if (!freeProductId) throw new Error("POLAR_PRODUCT_FREE is not set");

  /*
   * The missing row is not evidence that nothing was provisioned: account_status is written
   * asynchronously by the Polar webhook, which can lag or fail. Idempotency is therefore
   * anchored on Polar — treating our own row's absence as "not provisioned" would create a
   * second subscription on every page load until the webhook caught up.
   */
  const state = await ensureCustomer(deps.polar, user);
  const active = state?.activeSubscriptions[0];
  if (active) return planForProductId(active.productId, deps.products);

  try {
    await deps.polar.subscriptions.create({ productId: freeProductId, externalCustomerId: user.userId });
  } catch (error) {
    const raced = await customerState(deps.polar, user.userId);
    if (!raced?.activeSubscriptions.length) throw error;
  }

  // Returned rather than re-read: the webhook that writes the row has not necessarily
  // arrived yet, and only later visits depend on it.
  return "free";
}
