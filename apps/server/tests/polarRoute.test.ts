import { describe, expect, test } from "bun:test";
import { toSubscriptionStatus } from "../app/api/webhooks/polar/route";

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
