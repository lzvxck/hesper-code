import { Webhooks } from "@polar-sh/nextjs";
import type { SubscriptionCustomer } from "@polar-sh/sdk/models/components/subscriptioncustomer";
import type { WebhookSubscriptionActivePayload } from "@polar-sh/sdk/models/components/webhooksubscriptionactivepayload";
import type { WebhookSubscriptionCanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncanceledpayload";
import type { WebhookSubscriptionCreatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncreatedpayload";
import type { WebhookSubscriptionRevokedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionrevokedpayload";
import type { WebhookSubscriptionUncanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionuncanceledpayload";
import type { WebhookSubscriptionUpdatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionupdatedpayload";
import {
  type Plan,
  type ProductEnv,
  type SubscriptionStatus,
  missingProductVars,
  planForProductId,
} from "@seri/plans";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../../../lib/supabase";
import { type AccountStatusUpsertParams, upsertAccountStatus } from "../../../../lib/accountStatus";

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

/*
 * The mapping itself lives in @seri/plans, shared with the portal that reads this column —
 * a webhook writing a label the reader resolves to null is a silent failure neither side
 * would notice. What is decided *here* is the policy for an unconfigured deployment, which
 * is caller-specific: this writer throws, because a 5xx Polar retries beats writing a null
 * plan into every row, whereas the portal's reader stays quiet so a page still renders.
 */
export function toPlan(productId: string, env: ProductEnv = process.env): Plan | null {
  const missing = missingProductVars(env);
  if (missing.length > 0) {
    throw new Error(`Polar webhook: cannot resolve a plan, ${missing.join(", ")} not set`);
  }
  return planForProductId(productId, env);
}

export function toAccountStatusParams(
  customer: SubscriptionCustomer,
  status: SubscriptionStatus,
  plan: Plan | null,
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
