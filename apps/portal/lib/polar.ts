import { Polar } from "@polar-sh/sdk";
import type { CustomerState } from "@polar-sh/sdk/models/components/customerstate";
import { type ProductEnv, freeSubscription, paidSubscription } from "./plans";

let client: Polar | undefined;

// Anything other than an explicit "production" is read as sandbox, so a missing or
// misspelled POLAR_SERVER cannot point real money at the wrong environment.
export function polarServer(): "sandbox" | "production" {
  return process.env.POLAR_SERVER === "production" ? "production" : "sandbox";
}

// Same laziness as getSupabaseClient, for the same reason.
export function getPolarClient(): Polar {
  if (!client) {
    client = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN!, server: polarServer() });
  }
  return client;
}

export function polarStatusCode(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : undefined;
}

// Polar answers a missing customer with 404; anything else is a real failure.
export async function getCustomerState(polar: Polar, userId: string): Promise<CustomerState | null> {
  try {
    return await polar.customers.getStateExternal({ externalId: userId });
  } catch (error) {
    if (polarStatusCode(error) === 404) return null;
    throw error;
  }
}

/*
 * Nothing on Polar's side cancels the API-created Free subscription when a paid one starts,
 * and this codebase has no way to verify whether that will ever change — so the account is
 * left holding both until we clear it ourselves. Only a subscription whose product is the
 * configured free one is ever touched, and only once a paid subscription has definitely
 * been identified.
 *
 * A failure is logged rather than propagated: this is bookkeeping, and it must never be the
 * reason a page render or a plan change fails.
 */
export async function revokeSupersededFree(
  polar: Polar,
  subscriptions: { id: string; productId: string }[],
  products: ProductEnv,
): Promise<void> {
  if (!paidSubscription(subscriptions, products)) return;
  const free = freeSubscription(subscriptions, products);
  if (!free) return;
  try {
    await polar.subscriptions.revoke({ id: free.id });
  } catch (error) {
    console.warn(`Could not revoke superseded free subscription ${free.id}:`, error);
  }
}
