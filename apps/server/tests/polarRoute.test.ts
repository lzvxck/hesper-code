import { describe, expect, test } from "bun:test";
import type { SubscriptionCustomer } from "@polar-sh/sdk/models/components/subscriptioncustomer";
import type { WebhookSubscriptionCanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncanceledpayload";
import type { SupabaseClient } from "@supabase/supabase-js";
import { onSubscriptionCanceled, toAccountStatusParams, toSubscriptionStatus } from "../app/api/webhooks/polar/route";

describe("toSubscriptionStatus", () => {
  test.each([
    ["active", "active"],
    ["trialing", "active"],
    ["past_due", "past_due"],
    ["canceled", "canceled"],
  ] as const)("maps polar status %s to %s", (polarStatus, expected) => {
    expect(toSubscriptionStatus(polarStatus)).toBe(expected);
  });

  test.each(["incomplete", "incomplete_expired", "unpaid", "something_unknown"] as const)(
    "returns null for unmapped polar status %s",
    (polarStatus) => {
      expect(toSubscriptionStatus(polarStatus)).toBeNull();
    },
  );
});

function fakeCustomer(overrides: Partial<SubscriptionCustomer>): SubscriptionCustomer {
  return { id: "cus_1", externalId: "user_1", email: "a@example.com", ...overrides } as SubscriptionCustomer;
}

describe("toAccountStatusParams", () => {
  test("builds upsert params when externalId is present", () => {
    const params = toAccountStatusParams(fakeCustomer({}), "active");

    expect(params).toEqual({
      workosUserId: "user_1",
      email: "a@example.com",
      polarCustomerId: "cus_1",
      status: "active",
    });
  });

  test("returns null when externalId is missing", () => {
    expect(toAccountStatusParams(fakeCustomer({ externalId: null }), "active")).toBeNull();
  });

  test("returns null when externalId is undefined", () => {
    expect(toAccountStatusParams(fakeCustomer({ externalId: undefined }), "active")).toBeNull();
  });
});

function fakeSupabase() {
  const calls: { row: Record<string, unknown> }[] = [];
  const client = {
    from: () => ({
      upsert: (row: Record<string, unknown>) => {
        calls.push({ row });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("onSubscriptionCanceled", () => {
  test("upserts status 'canceled' even though payload.data.status is still 'active'", async () => {
    const { client, calls } = fakeSupabase();
    const payload = {
      data: { status: "active", customer: fakeCustomer({}) },
    } as unknown as WebhookSubscriptionCanceledPayload;

    await onSubscriptionCanceled(payload, client);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.row.subscription_status).toBe("canceled");
  });
});
