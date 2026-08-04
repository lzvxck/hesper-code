import { describe, expect, test } from "bun:test";
import type { Polar } from "@polar-sh/sdk";
import { changePlan, createCheckout } from "../lib/billing";

const PRODUCTS = {
  POLAR_PRODUCT_FREE: "prod_free",
  POLAR_PRODUCT_PRO: "prod_pro",
  POLAR_PRODUCT_MAX: "prod_max",
  POLAR_PRODUCT_ULTRA: "prod_ultra",
};

const SESSION_USER_ID = "user_session";

// Everything an attacker might hope a route reads instead of the session.
const HOSTILE_BODY = {
  plan: "max",
  userId: "user_victim",
  externalCustomerId: "user_victim",
  external_id: "user_victim",
  customerId: "cus_victim",
  subscriptionId: "sub_victim",
  productId: "prod_ultra",
};

function fakePolar(activeSubscriptions: { id: string; productId: string }[]) {
  const calls: { method: string; args: unknown }[] = [];
  const client = {
    checkouts: {
      create: (args: unknown) => {
        calls.push({ method: "checkouts.create", args });
        return Promise.resolve({ url: "https://sandbox.polar.sh/checkout/abc" });
      },
    },
    customers: {
      getStateExternal: (args: unknown) => {
        calls.push({ method: "customers.getStateExternal", args });
        return Promise.resolve({ activeSubscriptions });
      },
    },
    subscriptions: {
      update: (args: unknown) => {
        calls.push({ method: "subscriptions.update", args });
        return Promise.resolve({ id: "sub_session" });
      },
    },
  };
  return { client: client as unknown as Polar, calls };
}

/*
 * This is the only backstop that exists. Supabase Auth is unused here, so there is no
 * auth.uid() and no RLS policy to fall back on: if a route ever derived the account from
 * the request, nothing else in the system would notice.
 */
describe("createCheckout", () => {
  test("bills the session's account even when the body names another one", async () => {
    const { client: polar, calls } = fakePolar([]);

    const response = await createCheckout(
      { polar, products: PRODUCTS, userId: SESSION_USER_ID },
      HOSTILE_BODY.plan,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("https://sandbox.polar.sh/checkout/abc");
    expect(calls).toEqual([
      {
        method: "checkouts.create",
        args: { products: ["prod_max"], externalCustomerId: SESSION_USER_ID },
      },
    ]);
  });

  test("resolves the product id from the plan label, never from the request", async () => {
    const { client: polar, calls } = fakePolar([]);

    // The label says pro; the body's productId says ultra. The label wins.
    await createCheckout({ polar, products: PRODUCTS, userId: SESSION_USER_ID }, "pro");

    expect((calls[0]?.args as { products: string[] }).products).toEqual(["prod_pro"]);
  });

  test("rejects a plan label that is not one of the paid three, including free", async () => {
    const { client: polar, calls } = fakePolar([]);

    for (const plan of ["free", "enterprise", "", null, { plan: "pro" }]) {
      const response = await createCheckout({ polar, products: PRODUCTS, userId: SESSION_USER_ID }, plan);
      expect(response.status).toBe(400);
    }
    expect(calls).toEqual([]);
  });
});

describe("changePlan", () => {
  test("moves the session's subscription even when the body names another one", async () => {
    const { client: polar, calls } = fakePolar([{ id: "sub_session", productId: "prod_pro" }]);

    const response = await changePlan(
      { polar, products: PRODUCTS, userId: SESSION_USER_ID },
      HOSTILE_BODY.plan,
    );

    expect(response.status).toBe(303);
    expect(calls).toEqual([
      { method: "customers.getStateExternal", args: { externalId: SESSION_USER_ID } },
      {
        method: "subscriptions.update",
        args: { id: "sub_session", subscriptionUpdate: { productId: "prod_max", prorationBehavior: "invoice" } },
      },
    ]);
  });

  // Polar answers a PATCH on a free subscription with 402 missing_payment_method, so this
  // case belongs to /api/checkout and must not reach the update at all.
  test("returns 409 on a free subscription rather than attempting the update", async () => {
    const { client: polar, calls } = fakePolar([{ id: "sub_free", productId: "prod_free" }]);

    const response = await changePlan({ polar, products: PRODUCTS, userId: SESSION_USER_ID }, "pro");

    expect(response.status).toBe(409);
    expect(calls.some((call) => call.method === "subscriptions.update")).toBe(false);
  });

  test("returns 409 when the session has no active subscription", async () => {
    const { client: polar, calls } = fakePolar([]);

    const response = await changePlan({ polar, products: PRODUCTS, userId: SESSION_USER_ID }, "pro");

    expect(response.status).toBe(409);
    expect(calls.some((call) => call.method === "subscriptions.update")).toBe(false);
  });

  test("rejects a plan label that is not one of the paid three", async () => {
    const { client: polar, calls } = fakePolar([{ id: "sub_session", productId: "prod_pro" }]);

    const response = await changePlan({ polar, products: PRODUCTS, userId: SESSION_USER_ID }, "free");

    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });
});

/*
 * The handlers above are only safe if the route modules keep feeding them the session's
 * userId. They cannot be imported here — authkit-nextjs pulls in `server-only`, which
 * throws outside a React Server Component — so the guard is on their source: each one must
 * take its account from getSessionUser() and read nothing else off the request.
 */
describe("route handlers", () => {
  const ROUTES = ["checkout", "plan", "portal"];

  for (const route of ROUTES) {
    test(`/api/${route} takes its account from the session`, async () => {
      const source = await Bun.file(`${import.meta.dir}/../app/api/${route}/route.ts`).text();

      expect(source).toContain("getSessionUser()");
      // An account arriving as a query parameter or a header is the shape this forbids.
      expect(source).not.toContain("searchParams");
      expect(source).not.toContain("headers");
    });
  }
});
