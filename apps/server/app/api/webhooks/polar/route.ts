import { Webhooks } from "@polar-sh/nextjs";
import type { SubscriptionCustomer } from "@polar-sh/sdk/models/components/subscriptioncustomer";
import type { WebhookSubscriptionActivePayload } from "@polar-sh/sdk/models/components/webhooksubscriptionactivepayload";
import type { WebhookSubscriptionCanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncanceledpayload";
import type { WebhookSubscriptionCreatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncreatedpayload";
import type { WebhookSubscriptionRevokedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionrevokedpayload";
import type { WebhookSubscriptionUncanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionuncanceledpayload";
import type { WebhookSubscriptionUpdatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionupdatedpayload";
import { getSupabaseClient } from "../../../../lib/supabase";
import { type SubscriptionStatus, upsertAccountStatus } from "../../../../lib/accountStatus";

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
): { workosUserId: string; email: string | null; polarCustomerId: string; status: SubscriptionStatus } | null {
  if (!customer.externalId) return null;
  return {
    workosUserId: customer.externalId,
    email: customer.email ?? null,
    polarCustomerId: customer.id,
    status,
  };
}

function upsertFromCustomer(customer: SubscriptionCustomer, status: SubscriptionStatus): Promise<void> {
  const params = toAccountStatusParams(customer, status);
  if (!params) {
    console.warn(`Polar webhook: customer ${customer.id} has no externalId, skipping upsert`);
    return Promise.resolve();
  }
  return upsertAccountStatus(getSupabaseClient(), params);
}

function syncSubscription(
  payload:
    | WebhookSubscriptionCreatedPayload
    | WebhookSubscriptionActivePayload
    | WebhookSubscriptionCanceledPayload
    | WebhookSubscriptionUncanceledPayload
    | WebhookSubscriptionUpdatedPayload,
): Promise<void> {
  const status = toSubscriptionStatus(payload.data.status);
  if (!status) return Promise.resolve();
  return upsertFromCustomer(payload.data.customer, status);
}

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
  onSubscriptionCreated: syncSubscription,
  onSubscriptionActive: syncSubscription,
  onSubscriptionCanceled: syncSubscription,
  onSubscriptionUncanceled: syncSubscription,
  onSubscriptionUpdated: syncSubscription,
  onSubscriptionRevoked: (payload: WebhookSubscriptionRevokedPayload) =>
    upsertFromCustomer(payload.data.customer, "revoked"),
});
