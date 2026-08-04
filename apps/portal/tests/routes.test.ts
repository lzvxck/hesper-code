import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { Polar } from "@polar-sh/sdk";
import { changePlan, createCheckout } from "../lib/billing";

const PRODUCTS = {
  POLAR_PRODUCT_FREE: "prod_free",
  POLAR_PRODUCT_PRO: "prod_pro",
  POLAR_PRODUCT_MAX: "prod_max",
  POLAR_PRODUCT_ULTRA: "prod_ultra",
};

const SESSION_USER_ID = "user_session";
const VICTIM_USER_ID = "user_victim";
const ORIGIN = "https://portal.seriora.ai";

function fakePolar(activeSubscriptions: { id: string; productId: string }[], updateError?: unknown) {
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
        return updateError ? Promise.reject(updateError) : Promise.resolve({ id: "sub_session" });
      },
      revoke: (args: unknown) => {
        calls.push({ method: "subscriptions.revoke", args });
        return Promise.resolve({ id: "sub_free" });
      },
    },
  };
  return { client: client as unknown as Polar, calls };
}

const deps = (polar: Polar) => ({ polar, products: PRODUCTS, userId: SESSION_USER_ID, origin: ORIGIN });

describe("createCheckout", () => {
  test("bills the session's account, and sends the customer back here afterwards", async () => {
    const { client: polar, calls } = fakePolar([{ id: "sub_free", productId: "prod_free" }]);

    const response = await createCheckout(deps(polar), "max");

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("https://sandbox.polar.sh/checkout/abc");
    expect(calls).toContainEqual({
      method: "checkouts.create",
      args: {
        products: ["prod_max"],
        externalCustomerId: SESSION_USER_ID,
        successUrl: `${ORIGIN}/`,
      },
    });
  });

  /*
   * A checkout subscribes unconditionally. Without this an account whose plan we failed to
   * recognize — which is every row a webhook without POLAR_PRODUCT_* configured has ever
   * written — ends up paying for two subscriptions at once.
   */
  test("refuses when the account already holds a paid subscription", async () => {
    const { client: polar, calls } = fakePolar([{ id: "sub_paid", productId: "prod_pro" }]);

    const response = await createCheckout(deps(polar), "ultra");

    expect(response.status).toBe(409);
    expect(calls.some((call) => call.method === "checkouts.create")).toBe(false);
  });

  test("refuses when the account holds a product this deployment cannot identify", async () => {
    const { client: polar, calls } = fakePolar([{ id: "sub_x", productId: "prod_from_another_environment" }]);

    const response = await createCheckout(deps(polar), "pro");

    expect(response.status).toBe(409);
    expect(calls.some((call) => call.method === "checkouts.create")).toBe(false);
  });

  test("rejects a plan label that is not one of the paid three, including free", async () => {
    const { client: polar, calls } = fakePolar([]);

    for (const plan of ["free", "enterprise", "", null, { plan: "pro" }]) {
      expect((await createCheckout(deps(polar), plan)).status).toBe(400);
    }
    expect(calls).toEqual([]);
  });
});

describe("changePlan", () => {
  test("invoices an upgrade immediately", async () => {
    const { client: polar, calls } = fakePolar([{ id: "sub_session", productId: "prod_pro" }]);

    const response = await changePlan(deps(polar), "ultra");

    expect(response.status).toBe(303);
    expect(calls).toContainEqual({
      method: "subscriptions.update",
      args: {
        id: "sub_session",
        subscriptionUpdate: { productId: "prod_ultra", prorationBehavior: "invoice" },
      },
    });
  });

  /*
   * A drop takes effect at the end of the period the customer already paid for, per
   * docs-tmp/pricing-tiers.md. "invoice" here would raise an immediate negative proration —
   * a refund path nothing in this repo has measured.
   */
  test("defers a downgrade to the next period", async () => {
    const { client: polar, calls } = fakePolar([{ id: "sub_session", productId: "prod_ultra" }]);

    const response = await changePlan(deps(polar), "pro");

    expect(response.status).toBe(303);
    expect(calls).toContainEqual({
      method: "subscriptions.update",
      args: {
        id: "sub_session",
        subscriptionUpdate: { productId: "prod_pro", prorationBehavior: "next_period" },
      },
    });
  });

  // Polar does not order activeSubscriptions, and the free subscription outlives the
  // checkout that superseded it, so [0] here could be either one.
  test("updates the paid subscription even when the free one is listed first", async () => {
    const { client: polar, calls } = fakePolar([
      { id: "sub_free", productId: "prod_free" },
      { id: "sub_paid", productId: "prod_pro" },
    ]);

    await changePlan(deps(polar), "max");

    expect(calls).toContainEqual({
      method: "subscriptions.update",
      args: { id: "sub_paid", subscriptionUpdate: { productId: "prod_max", prorationBehavior: "invoice" } },
    });
    expect(calls).toContainEqual({ method: "subscriptions.revoke", args: { id: "sub_free" } });
  });

  // Measured against the sandbox: canceled, or merely scheduled to cancel, both answer 403
  // AlreadyCanceledSubscription. There is no way back through update, only a new checkout.
  test("answers 409, not a 500, when Polar says the subscription is already canceled", async () => {
    const alreadyCanceled = Object.assign(new Error("AlreadyCanceledSubscription"), { statusCode: 403 });
    const { client: polar } = fakePolar([{ id: "sub_session", productId: "prod_pro" }], alreadyCanceled);

    expect((await changePlan(deps(polar), "max")).status).toBe(409);
  });

  test("propagates a Polar failure that is not a canceled subscription", async () => {
    const serverError = Object.assign(new Error("polar responded 500"), { statusCode: 500 });
    const { client: polar } = fakePolar([{ id: "sub_session", productId: "prod_pro" }], serverError);

    await expect(changePlan(deps(polar), "max")).rejects.toThrow("polar responded 500");
  });

  test("returns 409 rather than attempting the update when only the free subscription is active", async () => {
    const { client: polar, calls } = fakePolar([{ id: "sub_free", productId: "prod_free" }]);

    const response = await changePlan(deps(polar), "pro");

    expect(response.status).toBe(409);
    expect(calls.some((call) => call.method === "subscriptions.update")).toBe(false);
  });

  test("returns 409 when the session has no active subscription", async () => {
    const { client: polar, calls } = fakePolar([]);

    expect((await changePlan(deps(polar), "pro")).status).toBe(409);
    expect(calls.some((call) => call.method === "subscriptions.update")).toBe(false);
  });

  test("rejects a plan label that is not one of the paid three", async () => {
    const { client: polar, calls } = fakePolar([{ id: "sub_session", productId: "prod_pro" }]);

    expect((await changePlan(deps(polar), "free")).status).toBe(400);
    expect(calls).toEqual([]);
  });
});

/*
 * The real route handlers, not a substring search over their source. Supabase Auth is
 * unused here, so there is no auth.uid() and no RLS policy underneath: if a route ever took
 * the account from the request, nothing else in the system would notice.
 *
 * The handlers are reachable under `bun test` because `server-only` — which
 * authkit-nextjs imports, and whose module body is a bare `throw` — is replaced first.
 * Only `getSessionUser` and `getPolarClient` are substituted; the routes' own logic runs.
 */
describe("route handlers", () => {
  let polarCalls: { method: string; args: unknown }[] = [];
  let checkoutRoute: typeof import("../app/api/checkout/route");
  let planRoute: typeof import("../app/api/plan/route");
  let portalRoute: typeof import("../app/api/portal/route");
  const originalProducts = { ...PRODUCTS };

  // A request that names somebody else's account in every place one could be smuggled.
  function hostileRequest(plan: string): Request {
    const body = new URLSearchParams({
      plan,
      userId: VICTIM_USER_ID,
      externalCustomerId: VICTIM_USER_ID,
      external_id: VICTIM_USER_ID,
      customerId: "cus_victim",
      subscriptionId: "sub_victim",
      productId: "prod_ultra",
    });
    return new Request(`${ORIGIN}/api/checkout?userId=${VICTIM_USER_ID}&externalCustomerId=${VICTIM_USER_ID}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-account-id": VICTIM_USER_ID,
        "x-workos-user-id": VICTIM_USER_ID,
      },
      body,
    });
  }

  beforeAll(async () => {
    for (const [name, value] of Object.entries(originalProducts)) process.env[name] = value;

    mock.module("server-only", () => ({}));
    mock.module("../lib/session", () => ({
      getSessionUser: async () => ({ userId: SESSION_USER_ID, email: "someone@seriora.ai" }),
    }));
    mock.module("../lib/polar", () => ({
      ...require("../lib/polar"),
      getPolarClient: () => {
        const { client, calls } = fakePolar([{ id: "sub_session", productId: "prod_pro" }]);
        polarCalls = calls;
        return client;
      },
    }));

    checkoutRoute = await import("../app/api/checkout/route");
    planRoute = await import("../app/api/plan/route");
    portalRoute = await import("../app/api/portal/route");
  });

  afterAll(() => {
    // Unset originally, so it has to be deleted — assigning undefined stores the string.
    for (const name of Object.keys(originalProducts)) delete process.env[name];
  });

  test("POST /api/checkout sends Polar the session's account, not the request's", async () => {
    // Already on Pro, so this one is refused — and the refusal itself is decided from the
    // session's Polar state, which is the point.
    const response = await checkoutRoute.POST(hostileRequest("max"));

    expect(response.status).toBe(409);
    expect(polarCalls).toContainEqual({
      method: "customers.getStateExternal",
      args: { externalId: SESSION_USER_ID },
    });
    expect(JSON.stringify(polarCalls)).not.toContain(VICTIM_USER_ID);
  });

  test("POST /api/plan updates the session's subscription, not the one named in the request", async () => {
    const response = await planRoute.POST(hostileRequest("max"));

    expect(response.status).toBe(303);
    expect(polarCalls).toContainEqual({
      method: "customers.getStateExternal",
      args: { externalId: SESSION_USER_ID },
    });
    expect(polarCalls).toContainEqual({
      method: "subscriptions.update",
      args: { id: "sub_session", subscriptionUpdate: { productId: "prod_max", prorationBehavior: "invoice" } },
    });
    expect(JSON.stringify(polarCalls)).not.toContain(VICTIM_USER_ID);
    expect(JSON.stringify(polarCalls)).not.toContain("sub_victim");
  });

  test("/api/portal resolves its customer from the session and ignores the request entirely", async () => {
    expect(await portalRoute.getExternalCustomerId()).toBe(SESSION_USER_ID);
  });
});
