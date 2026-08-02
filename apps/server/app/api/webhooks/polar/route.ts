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

export function toAccountStatusParams(
  customer: SubscriptionCustomer,
  status: SubscriptionStatus,
): AccountStatusUpsertParams | null {
  if (!customer.externalId) return null;
  return {
    workosUserId: customer.externalId,
    email: customer.email ?? null,
    polarCustomerId: customer.id,
    status,
  };
}

function upsertFromCustomer(
  customer: SubscriptionCustomer,
  status: SubscriptionStatus,
  supabase: SupabaseClient = getSupabaseClient(),
): Promise<void> {
  const params = toAccountStatusParams(customer, status);
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
  return upsertFromCustomer(payload.data.customer, status);
}

// Polar keeps `data.status` as "active" while a cancellation is only scheduled
// (subscription stays active until the current period ends), so this must not
// derive status from payload.data.status like syncSubscription does.
export function onSubscriptionCanceled(
  payload: WebhookSubscriptionCanceledPayload,
  supabase?: SupabaseClient,
): Promise<void> {
  return upsertFromCustomer(payload.data.customer, "canceled", supabase);
}

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
  onSubscriptionCreated: syncSubscription,
  onSubscriptionActive: syncSubscription,
  onSubscriptionCanceled,
  onSubscriptionUncanceled: syncSubscription,
  onSubscriptionUpdated: syncSubscription,
  onSubscriptionRevoked: (payload: WebhookSubscriptionRevokedPayload) =>
    upsertFromCustomer(payload.data.customer, "revoked"),
});
