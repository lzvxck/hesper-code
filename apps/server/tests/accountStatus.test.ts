import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUBSCRIPTION_STATUSES } from "@seri/plans";
import { type StoredAccountStatus, shouldWrite, upsertAccountStatus } from "../lib/accountStatus";

function fakeSupabase(error: unknown = null, stored: StoredAccountStatus | null = null) {
  const calls: { table: string; row: unknown; opts: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: stored, error: null }) }),
      }),
      upsert: (row: unknown, opts: unknown) => {
        calls.push({ table, row, opts });
        return Promise.resolve({ data: null, error });
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

/*
 * One row per customer, but a paying customer holds two Polar subscriptions — the Free one
 * nothing cancels, plus the paid one. Both emit webhooks into this one row, so without this
 * rule a Free renewal lands after a paid event and rewrites a Max customer as "free". The
 * portal then shows "You're on free", offers the upgrade button, and /api/checkout refuses
 * it with a 409 because Polar still shows the paid subscription — no working action left.
 */
describe("shouldWrite", () => {
  test("drops a free-product event when the row holds an active paid plan", () => {
    expect(shouldWrite("free", { plan: "max", subscription_status: "active" })).toBe(false);
  });

  test("always writes a paid-product event, whatever the row currently says", () => {
    expect(shouldWrite("max", { plan: "free", subscription_status: "active" })).toBe(true);
    expect(shouldWrite("pro", { plan: "ultra", subscription_status: "active" })).toBe(true);
  });

  test.each(["free", null])("writes a free-product event over a stored plan of %p", (plan) => {
    expect(shouldWrite("free", { plan, subscription_status: "active" })).toBe(true);
  });

  /*
   * The clause that keeps churn working. A customer whose paid subscription ended has
   * plan="pro", status="revoked" sitting in the row; blocking free events there would trap
   * them on a plan they no longer have.
   */
  test.each(["revoked", "canceled", "past_due"])(
    "writes a free-product event when the stored paid plan is %s",
    (status) => {
      expect(shouldWrite("free", { plan: "pro", subscription_status: status })).toBe(true);
    },
  );

  test("writes when there is no row at all", () => {
    expect(shouldWrite("free", null)).toBe(true);
  });

  // An unmapped product is not a free product, so it is not what this rule guards against.
  test("writes an unresolved plan rather than treating it as free", () => {
    expect(shouldWrite(null, { plan: "max", subscription_status: "active" })).toBe(true);
  });
});

describe("upsertAccountStatus row protection", () => {
  test("issues no write at all for a dropped free event, leaving subscription_status alone", async () => {
    const { client, calls } = fakeSupabase(null, { plan: "max", subscription_status: "active" });

    await upsertAccountStatus(client, {
      workosUserId: "user_1",
      email: null,
      polarCustomerId: "cus_free",
      status: "revoked",
      plan: "free",
    });

    expect(calls).toEqual([]);
  });

  test("writes when the stored row is a churned paid plan", async () => {
    const { client, calls } = fakeSupabase(null, { plan: "pro", subscription_status: "revoked" });

    await upsertAccountStatus(client, {
      workosUserId: "user_1",
      email: null,
      polarCustomerId: "cus_free",
      status: "active",
      plan: "free",
    });

    expect(calls).toHaveLength(1);
  });
});

describe("upsertAccountStatus", () => {
  for (const status of SUBSCRIPTION_STATUSES) {
    test(`upserts account_status with subscription_status "${status}"`, async () => {
      const { client, calls } = fakeSupabase();

      await upsertAccountStatus(client, {
        workosUserId: "user_1",
        email: "a@example.com",
        polarCustomerId: "cus_1",
        status,
        plan: "pro",
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]?.table).toBe("account_status");
      expect(calls[0]?.opts).toEqual({ onConflict: "workos_user_id" });
      const row = calls[0]?.row as Record<string, unknown>;
      expect(row.workos_user_id).toBe("user_1");
      expect(row.email).toBe("a@example.com");
      expect(row.polar_customer_id).toBe("cus_1");
      expect(row.subscription_status).toBe(status);
      expect(row.plan).toBe("pro");
      expect(typeof row.updated_at).toBe("string");
    });
  }

  test("passes through a null email unchanged", async () => {
    const { client, calls } = fakeSupabase();

    await upsertAccountStatus(client, {
      workosUserId: "user_2",
      email: null,
      polarCustomerId: "cus_2",
      status: "active",
      plan: "free",
    });

    const row = calls[0]?.row as Record<string, unknown>;
    expect(row.email).toBeNull();
  });

  // A product id the deployment has no env var for. Writing null beats guessing, and beats
  // leaving the column stale from a previous subscription.
  test("passes through a null plan unchanged", async () => {
    const { client, calls } = fakeSupabase();

    await upsertAccountStatus(client, {
      workosUserId: "user_4",
      email: null,
      polarCustomerId: "cus_4",
      status: "active",
      plan: null,
    });

    const row = calls[0]?.row as Record<string, unknown>;
    expect(row.plan).toBeNull();
  });

  test("throws when Supabase returns an error", async () => {
    const supabaseError = new Error("write failed");
    const { client } = fakeSupabase(supabaseError);

    await expect(
      upsertAccountStatus(client, {
        workosUserId: "user_3",
        email: null,
        polarCustomerId: "cus_3",
        status: "active",
        plan: "free",
      }),
    ).rejects.toThrow(supabaseError);
  });
});
