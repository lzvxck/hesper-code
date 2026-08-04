import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Polar } from "@polar-sh/sdk";
import { changePlan, createCheckout } from "../lib/billing";
import type { ActiveSubscription } from "../lib/subscriptions";

const PRODUCTS = {
  POLAR_PRODUCT_FREE: "prod_free",
  POLAR_PRODUCT_PRO: "prod_pro",
  POLAR_PRODUCT_MAX: "prod_max",
  POLAR_PRODUCT_ULTRA: "prod_ultra",
};

const SESSION_USER_ID = "user_session";
const VICTIM_USER_ID = "user_victim";
const ORIGIN = "https://portal.seriora.ai";

// Free costs nothing and is not winding down, unless a test says otherwise.
function sub(id: string, productId: string, overrides: Partial<ActiveSubscription> = {}): ActiveSubscription {
  return { id, productId, amount: productId === "prod_free" ? 0 : 2000, cancelAtPeriodEnd: false, ...overrides };
}

function fakePolar(
  activeSubscriptions: ActiveSubscription[],
  updateError?: unknown,
  calls: { method: string; args: unknown }[] = [],
) {
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
    const { client: polar, calls } = fakePolar([sub("sub_free", "prod_free")]);

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
    const { client: polar, calls } = fakePolar([sub("sub_paid", "prod_pro")]);

    const response = await createCheckout(deps(polar), "ultra");

    expect(response.status).toBe(409);
    expect(calls.some((call) => call.method === "checkouts.create")).toBe(false);
  });

  test("refuses when the account holds a product this deployment cannot identify", async () => {
    const { client: polar, calls } = fakePolar([sub("sub_x", "prod_from_another_environment")]);

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
    const { client: polar, calls } = fakePolar([sub("sub_session", "prod_pro")]);

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
    const { client: polar, calls } = fakePolar([sub("sub_session", "prod_ultra")]);

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
      sub("sub_free", "prod_free"),
      sub("sub_paid", "prod_pro"),
    ]);

    await changePlan(deps(polar), "max");

    expect(calls).toContainEqual({
      method: "subscriptions.update",
      args: { id: "sub_paid", subscriptionUpdate: { productId: "prod_max", prorationBehavior: "invoice" } },
    });
    expect(calls).toContainEqual({ method: "subscriptions.revoke", args: { id: "sub_free" } });
  });

  /*
   * Polar keeps a scheduled-to-cancel subscription in activeSubscriptions while our own row
   * already reads "canceled", so the page happily says "You're on pro". Both routes used to
   * refuse it with contradictory advice — "start a new one" from one, "change it under
   * Manage billing" from the other — and neither was possible. cancelAtPeriodEnd is how it
   * is told apart, and resuming in Polar's portal is the only real remedy.
   */
  test("refuses a scheduled-to-cancel subscription before Polar has to, and says to resume it", async () => {
    const { client: polar, calls } = fakePolar([
      sub("sub_session", "prod_pro", { cancelAtPeriodEnd: true }),
    ]);

    const response = await changePlan(deps(polar), "max");

    expect(response.status).toBe(409);
    expect(await response.text()).toContain("Resume it under Manage billing");
    expect(calls.some((call) => call.method === "subscriptions.update")).toBe(false);
  });

  test("gives the checkout route the same answer for the same account", async () => {
    const { client: polar, calls } = fakePolar([
      sub("sub_session", "prod_pro", { cancelAtPeriodEnd: true }),
    ]);

    const response = await createCheckout(deps(polar), "max");

    expect(response.status).toBe(409);
    expect(await response.text()).toContain("Resume it under Manage billing");
    expect(calls.some((call) => call.method === "checkouts.create")).toBe(false);
  });

  // Measured against the sandbox: canceled, or merely scheduled to cancel, both answer 403
  // AlreadyCanceledSubscription. Kept as the backstop for the window between our read and
  // the update, where the customer could have cancelled in Polar's portal meanwhile.
  test("answers 409, not a 500, when Polar says the subscription is already canceled", async () => {
    const alreadyCanceled = Object.assign(new Error("AlreadyCanceledSubscription"), { statusCode: 403 });
    const { client: polar } = fakePolar([sub("sub_session", "prod_pro")], alreadyCanceled);

    expect((await changePlan(deps(polar), "max")).status).toBe(409);
  });

  /*
   * Revoking is irreversible and the update is not guaranteed to succeed. Doing them the
   * other way round cancels the free fallback and then leaves the account on the plan it
   * was already on.
   */
  test("does not revoke the free subscription when the update fails", async () => {
    const serverError = Object.assign(new Error("polar responded 500"), { statusCode: 500 });
    const { client: polar, calls } = fakePolar(
      [sub("sub_free", "prod_free"), sub("sub_paid", "prod_pro")],
      serverError,
    );

    await expect(changePlan(deps(polar), "max")).rejects.toThrow("polar responded 500");
    expect(calls.some((call) => call.method === "subscriptions.revoke")).toBe(false);
  });

  test("propagates a Polar failure that is not a canceled subscription", async () => {
    const serverError = Object.assign(new Error("polar responded 500"), { statusCode: 500 });
    const { client: polar } = fakePolar([sub("sub_session", "prod_pro")], serverError);

    await expect(changePlan(deps(polar), "max")).rejects.toThrow("polar responded 500");
  });

  test("returns 409 rather than attempting the update when only the free subscription is active", async () => {
    const { client: polar, calls } = fakePolar([sub("sub_free", "prod_free")]);

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
    const { client: polar, calls } = fakePolar([sub("sub_session", "prod_pro")]);

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
 *
 * /api/portal is absent on purpose: its outbound call is made by @polar-sh/nextjs's own
 * CustomerPortal, which builds its own Polar client from the access token, so driving it
 * would reach the network. It previously exported its callback for a test that asserted a
 * stub returned what the stub was told to return — which could not fail. That wiring is
 * verified live instead.
 */
describe("route handlers", () => {
  // One array for the whole block, so an assertion never depends on getPolarClient having
  // been called exactly once per test or on the file running serially.
  const polarCalls: { method: string; args: unknown }[] = [];
  // What the fake reports for the session's customer; a test sets it before driving a route.
  let sessionSubscriptions: ActiveSubscription[] = [];
  let checkoutRoute: typeof import("../app/api/checkout/route");
  let planRoute: typeof import("../app/api/plan/route");
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
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = `${ORIGIN}/callback`;

    /*
     * NOTE: mock.module registers process-wide and afterAll does not undo it. The bare
     * `bun test` CI runs puts every file in one process, so a future test file importing
     * ../lib/session or ../lib/polar will get these stubs depending on file order. Only
     * getPolarClient is replaced on ../lib/polar — everything else is the real export.
     */
    mock.module("server-only", () => ({}));
    mock.module("../lib/session", () => ({
      getSessionUser: async () => ({ userId: SESSION_USER_ID, email: "someone@seriora.ai" }),
    }));
    mock.module("../lib/polar", () => ({
      ...require("../lib/polar"),
      getPolarClient: () => fakePolar(sessionSubscriptions, undefined, polarCalls).client,
    }));

    checkoutRoute = await import("../app/api/checkout/route");
    planRoute = await import("../app/api/plan/route");
  });

  afterAll(() => {
    // Unset originally, so they have to be deleted — assigning undefined stores the string.
    for (const name of Object.keys(originalProducts)) delete process.env[name];
    delete process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
  });

  beforeEach(() => {
    polarCalls.length = 0;
  });

  /*
   * The one that reaches checkouts.create. Without a free-only state the route 409s before
   * the create call site, and a regression smuggling the victim id into that call — the
   * only outbound call this route has — would never be executed.
   */
  test("POST /api/checkout creates the checkout against the session's account", async () => {
    sessionSubscriptions = [sub("sub_free", "prod_free")];

    const response = await checkoutRoute.POST(hostileRequest("max"));

    expect(response.status).toBe(303);
    expect(polarCalls).toContainEqual({
      method: "checkouts.create",
      args: { products: ["prod_max"], externalCustomerId: SESSION_USER_ID, successUrl: `${ORIGIN}/` },
    });
    expect(JSON.stringify(polarCalls)).not.toContain(VICTIM_USER_ID);
    expect(JSON.stringify(polarCalls)).not.toContain("prod_ultra");
  });

  test("POST /api/checkout looks the account up by the session's id, not the request's", async () => {
    sessionSubscriptions = [sub("sub_session", "prod_pro")];

    const response = await checkoutRoute.POST(hostileRequest("max"));

    expect(response.status).toBe(409);
    expect(polarCalls).toContainEqual({
      method: "customers.getStateExternal",
      args: { externalId: SESSION_USER_ID },
    });
    expect(JSON.stringify(polarCalls)).not.toContain(VICTIM_USER_ID);
  });

  test("POST /api/plan updates the session's subscription, not the one named in the request", async () => {
    sessionSubscriptions = [sub("sub_session", "prod_pro")];

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

  // A poisoned Host header would otherwise decide where Polar sends a paying customer next.
  test("takes the return origin from configuration, not from the request's host", async () => {
    sessionSubscriptions = [sub("sub_free", "prod_free")];
    const poisoned = new Request("https://attacker.example/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ plan: "pro" }),
    });

    await checkoutRoute.POST(poisoned);

    expect(JSON.stringify(polarCalls)).not.toContain("attacker.example");
    expect(polarCalls).toContainEqual({
      method: "checkouts.create",
      args: { products: ["prod_pro"], externalCustomerId: SESSION_USER_ID, successUrl: `${ORIGIN}/` },
    });
  });
});
