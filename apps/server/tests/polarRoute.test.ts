import { describe, expect, test } from "bun:test";
import type { SubscriptionCustomer } from "@polar-sh/sdk/models/components/subscriptioncustomer";
import type { WebhookSubscriptionCanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncanceledpayload";
import type { SupabaseClient } from "@supabase/supabase-js";
import { onSubscriptionCanceled, toAccountStatusParams, toPlan, toSubscriptionStatus } from "../app/api/webhooks/polar/route";

const PRODUCTS = {
  POLAR_PRODUCT_FREE: "prod_free",
  POLAR_PRODUCT_PRO: "prod_pro",
  POLAR_PRODUCT_MAX: "prod_max",
  POLAR_PRODUCT_ULTRA: "prod_ultra",
};

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

describe("toPlan", () => {
  test.each([
    ["prod_free", "free"],
    ["prod_pro", "pro"],
    ["prod_max", "max"],
    ["prod_ultra", "ultra"],
  ] as const)("maps product id %s to plan %s", (productId, expected) => {
    expect(toPlan(productId, PRODUCTS)).toBe(expected);
  });

  // The webhook is the only writer of this column, so an id it cannot place has to write
  // null rather than guess — same treatment an unrecognized status already gets.
  test("returns null for a product id that is not configured", () => {
    expect(toPlan("prod_from_the_other_environment", PRODUCTS)).toBeNull();
  });

  test("returns null for every product id when nothing is configured", () => {
    expect(toPlan("prod_free", {})).toBeNull();
  });
});

describe("toAccountStatusParams", () => {
  test("builds upsert params when externalId is present", () => {
    const params = toAccountStatusParams(fakeCustomer({}), "active", "pro");

    expect(params).toEqual({
      workosUserId: "user_1",
      email: "a@example.com",
      polarCustomerId: "cus_1",
      status: "active",
      plan: "pro",
    });
  });

  test("returns null when externalId is missing", () => {
    expect(toAccountStatusParams(fakeCustomer({ externalId: null }), "active", "pro")).toBeNull();
  });

  test("returns null when externalId is undefined", () => {
    expect(toAccountStatusParams(fakeCustomer({ externalId: undefined }), "active", "pro")).toBeNull();
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
      data: { status: "active", productId: "prod_pro", customer: fakeCustomer({}) },
    } as unknown as WebhookSubscriptionCanceledPayload;

    await onSubscriptionCanceled(payload, client);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.row.subscription_status).toBe("canceled");
  });

  // toPlan reads process.env here, which no test sets, so the product id is unmapped and
  // the column is written as null rather than left out of the row.
  test("writes a null plan for a product id the environment does not name", async () => {
    const { client, calls } = fakeSupabase();
    const payload = {
      data: { status: "active", productId: "prod_pro", customer: fakeCustomer({}) },
    } as unknown as WebhookSubscriptionCanceledPayload;

    await onSubscriptionCanceled(payload, client);

    expect(calls[0]?.row.plan).toBeNull();
  });
});
