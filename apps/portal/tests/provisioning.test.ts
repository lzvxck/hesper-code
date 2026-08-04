import { describe, expect, test } from "bun:test";
import type { Polar } from "@polar-sh/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureProvisioned } from "../lib/provisioning";
import type { ActiveSubscription } from "../lib/subscriptions";

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

type FakeState = { activeSubscriptions: ActiveSubscription[] } | null;

const PERIOD_END = new Date("2026-09-04T00:00:00Z");

// Renewing, not winding down, unless a test says otherwise.
function sub(id: string, productId: string, overrides: Partial<ActiveSubscription> = {}): ActiveSubscription {
  return {
    id,
    productId,
    amount: productId === "prod_free" ? 0 : 2000,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: PERIOD_END,
    ...overrides,
  };
}

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
      revoke: (args: unknown) => {
        calls.push({ method: "subscriptions.revoke", args });
        return Promise.resolve({ id: "sub_free" });
      },
    },
  };
  return { client: client as unknown as Polar, calls };
}

describe("ensureProvisioned", () => {
  test("returns the stored plan without touching Polar when the row is active and mapped", async () => {
    const { client: supabase, filters } = fakeSupabase({ plan: "max", subscription_status: "active" });
    const { client: polar, calls } = fakePolar([]);

    expect((await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).plan).toBe("max");
    expect(calls).toEqual([]);
    expect(filters).toEqual([{ table: "account_status", column: "workos_user_id", value: USER.userId }]);
  });

  /*
   * A churned customer whose row still says "pro" would be shown as a paying customer and
   * routed at /api/plan, which cannot revive a canceled subscription — Polar answers 403
   * AlreadyCanceledSubscription. They have to reach checkout, so a non-active row is worth
   * exactly as much as no row.
   */
  test.each(["revoked", "canceled", "past_due"])(
    "ignores a stored plan whose status is %s and asks Polar instead",
    async (status) => {
      const { client: supabase } = fakeSupabase({ plan: "pro", subscription_status: status });
      const { client: polar, calls } = fakePolar([{ activeSubscriptions: [] }]);

      expect((await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).plan).toBe("free");
      expect(calls.map((call) => call.method)).toEqual([
        "customers.getStateExternal",
        "subscriptions.create",
      ]);
    },
  );

  /*
   * The row a webhook without POLAR_PRODUCT_* configured writes. Believing it would route a
   * paying customer at /api/checkout and sell them a second subscription.
   */
  test("ignores an active row whose plan column is null and asks Polar instead", async () => {
    const { client: supabase } = fakeSupabase({ plan: null, subscription_status: "active" });
    const { client: polar } = fakePolar([{ activeSubscriptions: [sub("sub_1", "prod_max")] }]);

    expect((await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).plan).toBe("max");
  });

  test("creates nothing when Polar already has the customer and an active subscription", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar, calls } = fakePolar([
      { activeSubscriptions: [sub("sub_1", "prod_free")] },
    ]);

    expect((await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).plan).toBe("free");
    expect(calls.map((call) => call.method)).toEqual(["customers.getStateExternal"]);
  });

  // The webhook that writes our row can lag or fail, and when it does the account may
  // already be on a paid product. Reporting "free" there would understate it.
  test("reports the paid plan of an existing subscription when our row has not landed yet", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar } = fakePolar([{ activeSubscriptions: [sub("sub_1", "prod_pro")] }]);

    expect((await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).plan).toBe("pro");
  });

  /*
   * Polar allows both subscriptions to be active at once and does not order the array, so
   * [0] here is whichever one it felt like returning. The paid one is the answer.
   */
  test("picks the paid subscription even when the free one is listed first", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar } = fakePolar([
      {
        activeSubscriptions: [
          sub("sub_free", "prod_free"),
          sub("sub_paid", "prod_ultra"),
        ],
      },
    ]);

    expect((await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).plan).toBe("ultra");
  });

  /*
   * Reading is read-only. Whatever it finds, this function's job on an account that already
   * has a paid subscription is to report it and write nothing — the revoke that clears Free
   * belongs to the checkout, where it is a required step, not to a page render.
   */
  test("reports a paid subscription without writing anything", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar, calls } = fakePolar([
      { activeSubscriptions: [sub("sub_free", "prod_free"), sub("sub_paid", "prod_pro")] },
    ]);

    expect((await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).plan).toBe("pro");
    expect(calls.map((call) => call.method)).toEqual(["customers.getStateExternal"]);
  });

  /*
   * The path back to Free, and the repair for both ways a customer ends up with nothing: a
   * paid subscription that lapsed after a downgrade, and an abandoned checkout that had
   * already revoked Free to make room for itself.
   */
  test("re-creates Free for a customer who exists but holds no subscription", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar, calls } = fakePolar([{ activeSubscriptions: [] }]);

    expect(await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).toEqual({
      plan: "free",
      endsAt: null,
    });
    expect(calls.map((call) => call.method)).toEqual([
      "customers.getStateExternal",
      "subscriptions.create",
    ]);
    expect(calls[1]?.args).toEqual({ productId: "prod_free", externalCustomerId: USER.userId });
  });

  /*
   * The date the page needs to say "Pro until 4 September, then Free." Polar keeps a
   * scheduled-to-cancel subscription in activeSubscriptions, so without reading
   * cancelAtPeriodEnd the account looks like an ordinary paying one and the notice never
   * appears.
   */
  test("reports the end date when the paid subscription is scheduled to cancel", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar } = fakePolar([
      { activeSubscriptions: [sub("sub_paid", "prod_pro", { cancelAtPeriodEnd: true })] },
    ]);

    expect(await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).toEqual({
      plan: "pro",
      endsAt: PERIOD_END,
    });
  });

  test("reports no end date for a subscription that is simply renewing", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar } = fakePolar([{ activeSubscriptions: [sub("sub_paid", "prod_pro")] }]);

    expect(await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).toEqual({
      plan: "pro",
      endsAt: null,
    });
  });

  // Subscribing them to Free on top of a product we cannot identify risks charging twice.
  test("reports null and writes nothing when the only active product is unrecognized", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar, calls } = fakePolar([
      { activeSubscriptions: [sub("sub_x", "prod_from_another_environment")] },
    ]);

    expect((await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).plan).toBeNull();
    expect(calls.map((call) => call.method)).toEqual(["customers.getStateExternal"]);
  });

  test("creates the customer and then the free subscription, both keyed on the session userId", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar, calls } = fakePolar([null]);

    expect((await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).plan).toBe("free");
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

    expect((await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).plan).toBe("free");
    expect(calls.filter((call) => call.method === "customers.create")).toHaveLength(1);
    expect(calls.at(-1)?.method).toBe("subscriptions.create");
  });

  test("treats a duplicate subscription from a concurrent first visit as success", async () => {
    const { client: supabase } = fakeSupabase(null);
    const { client: polar, calls } = fakePolar(
      [null, { activeSubscriptions: [sub("sub_1", "prod_free")] }],
      "subscriptions.create",
    );

    expect((await ensureProvisioned({ supabase, polar, products: PRODUCTS }, USER)).plan).toBe("free");
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
