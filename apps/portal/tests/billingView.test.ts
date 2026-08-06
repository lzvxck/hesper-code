import { describe, expect, test } from "bun:test";
import type { Order } from "@polar-sh/sdk/models/components/order";
import { INCLUDED_SPEND_RATIO, PLAN_MONTHLY_USD, type PaidPlan } from "@seri/plans";
import { allowanceSentence, invoiceRows, subscriptionSummary } from "../lib/billingView";
import type { ScheduledChange } from "../lib/scheduled";

const AT = new Date("2026-09-04T00:00:00Z");

// Fixed rather than locale-dependent, per accountView.test.ts.
const formatDate = () => "4 September";

const ENDS: ScheduledChange = { kind: "ends", plan: "free", at: AT };
const CHANGES: ScheduledChange = { kind: "changes", plan: "pro", at: AT };

describe("subscriptionSummary", () => {
  test("a plain, renewing subscription reports the renewal date", () => {
    const summary = subscriptionSummary("pro", AT, null, formatDate);
    expect(summary.title).toBe("Pro");
    expect(summary.state).toBe("Renews 4 September");
  });

  // A subscription that has never been asked for a renewal date — renewsAt only exists once
  // Polar has been asked, and the fast path never asks.
  test("a plain subscription with no renewal date reports nothing rather than inventing one", () => {
    expect(subscriptionSummary("pro", null, null, formatDate).state).toBe("");
  });

  test("a pending cancellation reports its end date instead of a renewal", () => {
    const summary = subscriptionSummary("pro", AT, ENDS, formatDate);
    expect(summary.state).toBe("Ends 4 September");
  });

  test("a booked downgrade names both ends of the move", () => {
    const summary = subscriptionSummary("max", AT, CHANGES, formatDate);
    expect(summary.state).toBe("Max until 4 September, then Pro");
  });

  // The retired-product case: an active subscription on a product this deployment has no
  // mapping for. Nothing is known about what they hold, so no allowance figure may appear.
  test("an unrecognized product gets the retired-product copy and no allowance figure", () => {
    const summary = subscriptionSummary(null, null, null, formatDate);
    expect(summary.title).toBe("Plan not recognized");
    expect(summary.allowanceLine).toBe("");
    expect(summary.state).not.toContain("$");
  });
});

describe("allowanceSentence", () => {
  /*
   * Computed from PLAN_MONTHLY_USD x INCLUDED_SPEND_RATIO inside the test itself, not
   * hardcoded — a test asserting a literal "$15.00" would keep passing if the ratio changed
   * and the copy silently didn't. This is the negative control: change INCLUDED_SPEND_RATIO
   * and this test recomputes its own expectation from the mutated value, so it only stays
   * green if the implementation is doing the same arithmetic.
   */
  test.each(["pro", "max", "ultra"] satisfies PaidPlan[])(
    "%s's allowance is PLAN_MONTHLY_USD x INCLUDED_SPEND_RATIO, not a typed-out figure",
    (plan) => {
      const amount = (PLAN_MONTHLY_USD[plan] * INCLUDED_SPEND_RATIO).toFixed(2);
      expect(allowanceSentence(plan)).toBe(`Includes $${amount} of usage each period.`);
    },
  );

  // Free has no dollar allowance at all — the branch most likely to be got wrong.
  test("free never shows a dollar figure", () => {
    expect(allowanceSentence("free")).toBe("Zero-cost models only.");
  });
});

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order_1",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    status: "paid",
    totalAmount: 2000,
    ...overrides,
  } as unknown as Order;
}

describe("invoiceRows", () => {
  test("orders newest first", () => {
    const older = order({ id: "order_old", createdAt: new Date("2026-07-01T00:00:00Z") });
    const newer = order({ id: "order_new", createdAt: new Date("2026-08-01T00:00:00Z") });

    expect(invoiceRows([older, newer], formatDate).map((row) => row.id)).toEqual(["order_new", "order_old"]);
  });

  test("a refunded order carries its status", () => {
    expect(invoiceRows([order({ status: "refunded" })], formatDate)[0]?.status).toBe("refunded");
  });

  test("an unpaid order carries its status", () => {
    expect(invoiceRows([order({ status: "pending" })], formatDate)[0]?.status).toBe("pending");
  });

  test("the empty list stays empty", () => {
    expect(invoiceRows([], formatDate)).toEqual([]);
  });

  test("formats the amount from cents", () => {
    expect(invoiceRows([order({ totalAmount: 2000 })], formatDate)[0]?.amount).toBe("$20.00");
  });
});
