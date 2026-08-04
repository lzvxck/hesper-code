import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type SubscriptionStatus, upsertAccountStatus } from "../lib/accountStatus";

function fakeSupabase(error: unknown = null) {
  const calls: { table: string; row: unknown; opts: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      upsert: (row: unknown, opts: unknown) => {
        calls.push({ table, row, opts });
        return Promise.resolve({ data: null, error });
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("upsertAccountStatus", () => {
  const statuses: SubscriptionStatus[] = ["active", "canceled", "past_due", "revoked"];

  for (const status of statuses) {
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
