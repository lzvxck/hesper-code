import { Webhooks } from "@polar-sh/nextjs";
import type { WebhookSubscriptionActivePayload } from "@polar-sh/sdk/models/components/webhooksubscriptionactivepayload";
import type { WebhookSubscriptionCanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncanceledpayload";
import type { WebhookSubscriptionCreatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncreatedpayload";
import type { WebhookSubscriptionRevokedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionrevokedpayload";
import type { WebhookSubscriptionUncanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionuncanceledpayload";
import { getSupabaseClient } from "../../../../lib/supabase";
import { type SubscriptionStatus, upsertAccountStatus } from "../../../../lib/accountStatus";

function syncSubscription(
  payload:
    | WebhookSubscriptionCreatedPayload
    | WebhookSubscriptionActivePayload
    | WebhookSubscriptionCanceledPayload
    | WebhookSubscriptionRevokedPayload
    | WebhookSubscriptionUncanceledPayload,
  status: SubscriptionStatus,
): Promise<void> {
  const { customer } = payload.data;
  return upsertAccountStatus(getSupabaseClient(), {
    workosUserId: customer.externalId ?? "",
    email: customer.email ?? null,
    polarCustomerId: customer.id,
    status,
  });
}

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
  onSubscriptionCreated: (payload) => syncSubscription(payload, "active"),
  onSubscriptionActive: (payload) => syncSubscription(payload, "active"),
  onSubscriptionCanceled: (payload) => syncSubscription(payload, "canceled"),
  onSubscriptionRevoked: (payload) => syncSubscription(payload, "revoked"),
  onSubscriptionUncanceled: (payload) => syncSubscription(payload, "active"),
});
