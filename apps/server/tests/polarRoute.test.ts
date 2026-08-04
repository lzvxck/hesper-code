import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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

  /*
   * Not a warning. Writing null into every row is what let the portal read a paying
   * customer as unplanned and sell them a second subscription — the throw becomes a 5xx
   * Polar retries, so the row stays unwritten until the deployment is configured.
   */
  test("throws, naming every missing variable, when nothing is configured", () => {
    expect(() => toPlan("prod_free", {})).toThrow(
      "POLAR_PRODUCT_FREE, POLAR_PRODUCT_PRO, POLAR_PRODUCT_MAX, POLAR_PRODUCT_ULTRA not set",
    );
  });

  test("throws when only some of the variables are set", () => {
    const partial = { POLAR_PRODUCT_FREE: "prod_free", POLAR_PRODUCT_PRO: "prod_pro" };

    expect(() => toPlan("prod_free", partial)).toThrow("POLAR_PRODUCT_MAX, POLAR_PRODUCT_ULTRA not set");
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

function canceledPayload(productId: string): WebhookSubscriptionCanceledPayload {
  return {
    data: { status: "active", productId, customer: fakeCustomer({}) },
  } as unknown as WebhookSubscriptionCanceledPayload;
}

describe("onSubscriptionCanceled", () => {
  // The route resolves the plan through process.env, so these have to be real for the
  // duration and gone afterwards — reassigning undefined would store the string.
  beforeAll(() => {
    for (const [name, value] of Object.entries(PRODUCTS)) process.env[name] = value;
  });
  afterAll(() => {
    for (const name of Object.keys(PRODUCTS)) delete process.env[name];
  });

  test("upserts status 'canceled' even though payload.data.status is still 'active'", async () => {
    const { client, calls } = fakeSupabase();

    await onSubscriptionCanceled(canceledPayload("prod_pro"), client);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.row.subscription_status).toBe("canceled");
    expect(calls[0]?.row.plan).toBe("pro");
  });

  // Configured, but on a product this environment does not name — a leftover from another
  // Polar organization, say. Null beats guessing, and beats leaving the column stale.
  test("writes a null plan for a product id that is configured away", async () => {
    const { client, calls } = fakeSupabase();

    await onSubscriptionCanceled(canceledPayload("prod_from_the_other_environment"), client);

    expect(calls[0]?.row.plan).toBeNull();
  });
});
