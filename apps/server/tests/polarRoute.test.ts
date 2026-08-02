import { describe, expect, test } from "bun:test";
import type { SubscriptionCustomer } from "@polar-sh/sdk/models/components/subscriptioncustomer";
import { toAccountStatusParams, toSubscriptionStatus } from "../app/api/webhooks/polar/route";

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
