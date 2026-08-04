import { describe, expect, test } from "bun:test";
import type { Polar } from "@polar-sh/sdk";
import { type ActiveSubscription, freeSubscription, paidSubscription, revokeSupersededFree } from "../lib/subscriptions";

const PRODUCTS = {
  POLAR_PRODUCT_FREE: "prod_free",
  POLAR_PRODUCT_PRO: "prod_pro",
  POLAR_PRODUCT_MAX: "prod_max",
  POLAR_PRODUCT_ULTRA: "prod_ultra",
};

function sub(id: string, productId: string, overrides: Partial<ActiveSubscription> = {}): ActiveSubscription {
  return { id, productId, amount: productId === "prod_free" ? 0 : 2000, cancelAtPeriodEnd: false, ...overrides };
}

function fakePolar(revokeError?: unknown) {
  const revoked: string[] = [];
  const client = {
    subscriptions: {
      revoke: ({ id }: { id: string }) => {
        revoked.push(id);
        return revokeError ? Promise.reject(revokeError) : Promise.resolve({ id });
      },
    },
  };
  return { client: client as unknown as Polar, revoked };
}

/*
 * Polar allows one customer to hold several active subscriptions at once, does not order
 * activeSubscriptions, and leaves the API-created free one running after a paid checkout —
 * so which element answers "what plan is this account on" is a real decision, not an index.
 */
describe("paidSubscription", () => {
  test("finds the paid subscription whichever position it is in", () => {
    const free = sub("sub_free", "prod_free");
    const paid = sub("sub_paid", "prod_max");

    for (const order of [[free, paid], [paid, free]]) {
      expect(paidSubscription(order, PRODUCTS)).toEqual({ subscription: paid, plan: "max" });
    }
  });

  test("carries the plan label, so no caller has to map the product id a second time", () => {
    expect(paidSubscription([sub("sub_1", "prod_ultra")], PRODUCTS)?.plan).toBe("ultra");
  });

  test("returns null when the only subscription is the free one", () => {
    expect(paidSubscription([sub("sub_free", "prod_free")], PRODUCTS)).toBeNull();
  });

  test("returns null for a product this deployment has no variable for", () => {
    expect(paidSubscription([sub("sub_x", "prod_from_another_environment")], PRODUCTS)).toBeNull();
  });

  test("returns null for an empty list", () => {
    expect(paidSubscription([], PRODUCTS)).toBeNull();
  });
});

describe("freeSubscription", () => {
  test("finds the free subscription whichever position it is in", () => {
    const free = sub("sub_free", "prod_free");
    const paid = sub("sub_paid", "prod_pro");

    for (const order of [[free, paid], [paid, free]]) {
      expect(freeSubscription(order, PRODUCTS)).toEqual(free);
    }
  });

  test("returns null when nothing maps to the free product", () => {
    expect(freeSubscription([sub("sub_paid", "prod_pro")], PRODUCTS)).toBeNull();
  });
});

describe("revokeSupersededFree", () => {
  test("revokes the free subscription once a paid one supersedes it", async () => {
    const { client, revoked } = fakePolar();

    await revokeSupersededFree(client, [sub("sub_free", "prod_free"), sub("sub_paid", "prod_pro")], PRODUCTS);

    expect(revoked).toEqual(["sub_free"]);
  });

  test("leaves a lone free subscription alone", async () => {
    const { client, revoked } = fakePolar();

    await revokeSupersededFree(client, [sub("sub_free", "prod_free")], PRODUCTS);

    expect(revoked).toEqual([]);
  });

  /*
   * The backstop for POLAR_PRODUCT_FREE pointed at a paid product. Without it, one
   * configuration typo silently cancels a subscription somebody is paying for, and the
   * operation is irreversible.
   */
  test("never revokes a subscription that costs money, whatever the config calls free", async () => {
    const { client, revoked } = fakePolar();

    await revokeSupersededFree(
      client,
      [sub("sub_mislabelled", "prod_free", { amount: 2000 }), sub("sub_paid", "prod_pro")],
      PRODUCTS,
    );

    expect(revoked).toEqual([]);
  });

  test("does nothing when the products are not configured at all", async () => {
    const { client, revoked } = fakePolar();

    await revokeSupersededFree(client, [sub("sub_free", "prod_free"), sub("sub_paid", "prod_pro")], {});

    expect(revoked).toEqual([]);
  });

  // Bookkeeping must never be the reason a page render or a plan change fails.
  test("swallows a revoke failure rather than propagating it", async () => {
    const { client } = fakePolar(new Error("polar responded 500"));

    expect(
      await revokeSupersededFree(client, [sub("sub_free", "prod_free"), sub("sub_paid", "prod_pro")], PRODUCTS),
    ).toBeUndefined();
  });
});
