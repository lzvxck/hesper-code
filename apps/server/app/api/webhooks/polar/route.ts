import { Webhooks } from "@polar-sh/nextjs";
import type { SubscriptionCustomer } from "@polar-sh/sdk/models/components/subscriptioncustomer";
import type { WebhookSubscriptionActivePayload } from "@polar-sh/sdk/models/components/webhooksubscriptionactivepayload";
import type { WebhookSubscriptionCanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncanceledpayload";
import type { WebhookSubscriptionCreatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncreatedpayload";
import type { WebhookSubscriptionRevokedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionrevokedpayload";
import type { WebhookSubscriptionUncanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionuncanceledpayload";
import type { WebhookSubscriptionUpdatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionupdatedpayload";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../../../lib/supabase";
import {
  type AccountStatusUpsertParams,
  type SubscriptionStatus,
  upsertAccountStatus,
} from "../../../../lib/accountStatus";

export function toSubscriptionStatus(polarStatus: string): SubscriptionStatus | null {
  switch (polarStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return null;
  }
}

const PLAN_PRODUCT_ENV_VAR: Record<string, string> = {
  free: "POLAR_PRODUCT_FREE",
  pro: "POLAR_PRODUCT_PRO",
  max: "POLAR_PRODUCT_MAX",
  ultra: "POLAR_PRODUCT_ULTRA",
};

/*
 * Product ids differ between the Polar sandbox and production, so the mapping is
 * configuration rather than a constant, and the record is injected so a test needs no
 * environment of its own.
 *
 * Unconfigured throws rather than warning. This webhook is the only writer of
 * account_status.plan, and a deployment missing these variables silently wrote null into
 * every row — which the portal then read as "no plan", routed at checkout, and sold the
 * customer a second subscription. Failing here returns a 5xx that Polar retries, so the
 * rows stay unwritten until somebody sets the variables, instead of being written wrong.
 */
export function toPlan(productId: string, env: Record<string, string | undefined> = process.env): string | null {
  const missing = Object.values(PLAN_PRODUCT_ENV_VAR).filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Polar webhook: cannot resolve a plan, ${missing.join(", ")} not set`);
  }
  return Object.keys(PLAN_PRODUCT_ENV_VAR).find((plan) => env[PLAN_PRODUCT_ENV_VAR[plan]!] === productId) ?? null;
}

export function toAccountStatusParams(
  customer: SubscriptionCustomer,
  status: SubscriptionStatus,
  plan: string | null,
): AccountStatusUpsertParams | null {
  if (!customer.externalId) return null;
  return {
    workosUserId: customer.externalId,
    email: customer.email ?? null,
    polarCustomerId: customer.id,
    status,
    plan,
  };
}

function upsertFromCustomer(
  customer: SubscriptionCustomer,
  status: SubscriptionStatus,
  productId: string,
  supabase: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const plan = toPlan(productId);
  if (!plan) {
    console.warn(`Polar webhook: unrecognized product id "${productId}", writing plan as null`);
  }
  const params = toAccountStatusParams(customer, status, plan);
  if (!params) {
    console.warn(`Polar webhook: customer ${customer.id} has no externalId, skipping upsert`);
    return Promise.resolve();
  }
  return upsertAccountStatus(supabase, params);
}

function syncSubscription(
  payload:
    | WebhookSubscriptionCreatedPayload
    | WebhookSubscriptionActivePayload
    | WebhookSubscriptionUncanceledPayload
    | WebhookSubscriptionUpdatedPayload,
): Promise<void> {
  const status = toSubscriptionStatus(payload.data.status);
  if (!status) {
    console.warn(`Polar webhook: unrecognized subscription status "${payload.data.status}", skipping upsert`);
    return Promise.resolve();
  }
  return upsertFromCustomer(payload.data.customer, status, payload.data.productId);
}

// Polar keeps `data.status` as "active" while a cancellation is only scheduled
// (subscription stays active until the current period ends), so this must not
// derive status from payload.data.status like syncSubscription does.
export function onSubscriptionCanceled(
  payload: WebhookSubscriptionCanceledPayload,
  supabase?: SupabaseClient,
): Promise<void> {
  return upsertFromCustomer(payload.data.customer, "canceled", payload.data.productId, supabase);
}

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
  onSubscriptionCreated: syncSubscription,
  onSubscriptionActive: syncSubscription,
  onSubscriptionCanceled,
  onSubscriptionUncanceled: syncSubscription,
  onSubscriptionUpdated: syncSubscription,
  onSubscriptionRevoked: (payload: WebhookSubscriptionRevokedPayload) =>
    upsertFromCustomer(payload.data.customer, "revoked", payload.data.productId),
});
