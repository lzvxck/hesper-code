import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUBSCRIPTION_STATUSES } from "@seri/plans";
import { upsertAccountStatus } from "../lib/accountStatus";

type Upsert = { row: Record<string, unknown>; opts: Record<string, unknown> };
type Update = { row: Record<string, unknown>; eq: [string, unknown][]; or: string[] };

/*
 * Records which statements were issued, not just that something was written. The rule this
 * module enforces now lives in the UPDATE's filter rather than in a branch taken after a
 * read, so "did it write?" is no longer the interesting question — "under what condition?" is.
 */
function fakeSupabase(error: unknown = null) {
  const upserts: Upsert[] = [];
  const updates: Update[] = [];
  const client = {
    from: () => ({
      upsert: (row: Record<string, unknown>, opts: Record<string, unknown>) => {
        upserts.push({ row, opts });
        return Promise.resolve({ data: null, error });
      },
      update: (row: Record<string, unknown>) => {
        const record: Update = { row, eq: [], or: [] };
        updates.push(record);
        const chain = {
          eq: (column: string, value: unknown) => {
            record.eq.push([column, value]);
            return chain;
          },
          or: (expression: string) => {
            record.or.push(expression);
            return Promise.resolve({ data: null, error });
          },
        };
        return chain;
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, upserts, updates };
}

const FREE_EVENT = {
  workosUserId: "user_1",
  email: null,
  polarCustomerId: "cus_free",
  status: "revoked",
  plan: "free",
} as const;

/*
 * Upgrading revokes the Free subscription immediately before the paid one is created, so a
 * free `subscription.revoked` and the paid events are in flight together. Arriving late, the
 * free one would rewrite a paying customer as plan="free", status="revoked".
 *
 * This used to be enforced by reading the row and then upserting, which lost exactly that
 * race: the read could land before the paid write committed. These tests are about the
 * condition travelling *with* the write.
 */
describe("upsertAccountStatus free-event protection", () => {
  test("conditions the write on the row, instead of reading it first", async () => {
    const { client, upserts, updates } = fakeSupabase();

    await upsertAccountStatus(client, FREE_EVENT);

    // Create-if-absent, then claim-if-allowed. Nothing is read.
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.opts).toEqual({ onConflict: "workos_user_id", ignoreDuplicates: true });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.eq).toEqual([["workos_user_id", "user_1"]]);
  });

  /*
   * The two `is.null` clauses are the ones worth asserting by name. In SQL both `plan NOT IN
   * ('pro',…)` and `subscription_status <> 'active'` evaluate to NULL — not true — when the
   * column is NULL, so dropping them would make a row with no plan yet refuse every free
   * event, which is the opposite of what the rule intends.
   */
  test("lets a free event through except over an active paid row", async () => {
    const { client, updates } = fakeSupabase();

    await upsertAccountStatus(client, FREE_EVENT);

    expect(updates[0]?.or).toEqual([
      "plan.not.in.(pro,max,ultra),plan.is.null,subscription_status.neq.active,subscription_status.is.null",
    ]);
  });

  test("throws when the conditional update fails", async () => {
    const supabaseError = new Error("write failed");
    const { client } = fakeSupabase(supabaseError);

    await expect(upsertAccountStatus(client, FREE_EVENT)).rejects.toThrow(supabaseError);
  });
});

/*
 * Paid wins unconditionally, and so does an unresolved plan: a product id this deployment has
 * no variable for is not a free product, so it is not what the rule guards against.
 */
describe("upsertAccountStatus", () => {
  test.each(["pro", "max", "ultra", null] as const)("writes plan %p with no condition", async (plan) => {
    const { client, upserts, updates } = fakeSupabase();

    await upsertAccountStatus(client, {
      workosUserId: "user_1",
      email: null,
      polarCustomerId: "cus_1",
      status: "active",
      plan,
    });

    expect(updates).toEqual([]);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.opts).toEqual({ onConflict: "workos_user_id" });
    expect(upserts[0]?.row.plan).toBe(plan);
  });

  for (const status of SUBSCRIPTION_STATUSES) {
    test(`upserts account_status with subscription_status "${status}"`, async () => {
      const { client, upserts } = fakeSupabase();

      await upsertAccountStatus(client, {
        workosUserId: "user_1",
        email: "a@example.com",
        polarCustomerId: "cus_1",
        status,
        plan: "pro",
      });

      const row = upserts[0]?.row as Record<string, unknown>;
      expect(row.workos_user_id).toBe("user_1");
      expect(row.email).toBe("a@example.com");
      expect(row.polar_customer_id).toBe("cus_1");
      expect(row.subscription_status).toBe(status);
      expect(row.plan).toBe("pro");
      expect(typeof row.updated_at).toBe("string");
    });
  }

  test("passes through a null email unchanged", async () => {
    const { client, upserts } = fakeSupabase();

    await upsertAccountStatus(client, {
      workosUserId: "user_2",
      email: null,
      polarCustomerId: "cus_2",
      status: "active",
      plan: "free",
    });

    expect(upserts[0]?.row.email).toBeNull();
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
        plan: "pro",
      }),
    ).rejects.toThrow(supabaseError);
  });
});
