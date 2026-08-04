import { describe, expect, test } from "bun:test";
import type { Polar } from "@polar-sh/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureProvisioned } from "../lib/provisioning";

const PRODUCTS = {
  POLAR_PRODUCT_FREE: "prod_free",
  POLAR_PRODUCT_PRO: "prod_pro",
  POLAR_PRODUCT_MAX: "prod_max",
  POLAR_PRODUCT_ULTRA: "prod_ultra",
};

const USER = { userId: "user_01H", email: "someone@seriora.ai" };

function fakeSupabase(row: Record<string, unknown> | null) {
  const filters: { table: string; column: string; value: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: unknown) => ({
          maybeSingle: () => {
            filters.push({ table, column, value });
            return Promise.resolve({ data: row, error: null });
          },
        }),
      }),
    }),
  };
  return { client: client as unknown as SupabaseClient, filters };
}

type FakeState = { activeSubscriptions: { id: string; productId: string }[] } | null;

function polarError(statusCode: number) {
  return Object.assign(new Error(`polar responded ${statusCode}`), { statusCode });
}

/*
 * `states` is the queue of answers getStateExternal gives, one per call, with the last one
 * repeating. `null` means Polar has no such customer (404). `throwOn` makes one of the two
 * create calls fail, which is how both the concurrent-first-visit race and the rejected
 * email are reproduced.
 */
function fakePolar(states: FakeState[], throwOn?: "customers.create" | "subscriptions.create") {
  const calls: { method: string; args: unknown }[] = [];
  let index = 0;
  const client = {
    customers: {
      getStateExternal: (args: unknown) => {
        calls.push({ method: "customers.getStateExternal", args });
        const state = states[Math.min(index++, states.length - 1)] ?? null;
        return state ? Promise.resolve(state) : Promise.reject(polarError(404));
      },
      create: (args: unknown) => {
        calls.push({ method: "customers.create", args });
        return throwOn === "customers.create"
          ? Promise.reject(polarError(422))
          : Promise.resolve({ id: "cus_1" });
      },
    },
    subscriptions: {
      create: (args: unknown) => {
        calls.push({ method: "subscriptions.create", args });
        return throwOn === "subscriptions.create"
          ? Promise.reject(polarError(409))
          : Promise.resolve({ id: "sub_1" });
      },
    },
  };
  return { client: client as unknown as Polar, calls };
}

describe("ensureProvisioned", () => {
  test("returns the stored plan without touching Polar when the row exists", async () => {
    const { client: supabase, filters } = fakeSupabase({ plan: "max", subscription_status: "active" });
    const { client: polar, calls } = fakePolar([]);

    expect(await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).toBe("max");
    expect(calls).toEqual([]);
    expect(filters).toEqual([{ table: "account_status", column: "workos_user_id", value: USER.userId }]);
  });

  test("returns null when the stored row is on a product that is not one of the four", async () => {
    const { client: supabase } = fakeSupabase({ plan: null, subscription_status: "active" });
    const { client: polar } = fakePolar([]);

    expect(await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).toBeNull();
  });

  test("creates nothing when Polar already has the customer and an active subscription", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar, calls } = fakePolar([
      { activeSubscriptions: [{ id: "sub_1", productId: "prod_free" }] },
    ]);

    expect(await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).toBe("free");
    expect(calls.map((call) => call.method)).toEqual(["customers.getStateExternal"]);
  });

  // The webhook that writes our row can lag or fail, and when it does the account may
  // already be on a paid product. Reporting "free" there would understate it.
  test("reports the paid plan of an existing subscription when our row has not landed yet", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar } = fakePolar([{ activeSubscriptions: [{ id: "sub_1", productId: "prod_pro" }] }]);

    expect(await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).toBe("pro");
  });

  test("creates the customer and then the free subscription, both keyed on the session userId", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar, calls } = fakePolar([null]);

    expect(await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).toBe("free");
    expect(calls.map((call) => call.method)).toEqual([
      "customers.getStateExternal",
      "customers.create",
      "subscriptions.create",
    ]);
    expect(calls[1]?.args).toEqual({ email: USER.email, externalId: USER.userId });
    expect(calls[2]?.args).toEqual({ productId: "prod_free", externalCustomerId: USER.userId });
  });

  test("treats a duplicate customer from a concurrent first visit as success", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar, calls } = fakePolar([null, { activeSubscriptions: [] }], "customers.create");

    expect(await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).toBe("free");
    expect(calls.filter((call) => call.method === "customers.create")).toHaveLength(1);
    expect(calls.at(-1)?.method).toBe("subscriptions.create");
  });

  test("treats a duplicate subscription from a concurrent first visit as success", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar, calls } = fakePolar(
      [null, { activeSubscriptions: [{ id: "sub_1", productId: "prod_free" }] }],
      "subscriptions.create",
    );

    expect(await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).toBe("free");
    expect(calls.filter((call) => call.method === "subscriptions.create")).toHaveLength(1);
  });

  // Polar validates email deliverability. That failure looks like the duplicate above, and
  // is told apart by the customer still not existing on the re-read.
  test("surfaces a customer-create error that was not a race", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar, calls } = fakePolar([null, null], "customers.create");

    await expect(ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).rejects.toThrow(
      "polar responded 422",
    );
    expect(calls.some((call) => call.method === "subscriptions.create")).toBe(false);
  });

  test("surfaces a subscription-create error that was not a race", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar } = fakePolar([null, { activeSubscriptions: [] }], "subscriptions.create");

    await expect(ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).rejects.toThrow(
      "polar responded 409",
    );
  });

  test("refuses to provision when the free product id is not configured", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar, calls } = fakePolar([null]);

    await expect(ensureProvisioned({ supabase, polar, products: {} }, USER)).rejects.toThrow(
      "POLAR_PRODUCT_FREE is not set",
    );
    expect(calls).toEqual([]);
  });
});
