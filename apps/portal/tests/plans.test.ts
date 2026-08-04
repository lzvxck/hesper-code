import { describe, expect, test } from "bun:test";
import { PLANS, isPaidPlan, planForProductId, productIdForPlan, toPlan } from "../lib/plans";

const ENV = {
  POLAR_PRODUCT_FREE: "prod_free",
  POLAR_PRODUCT_PRO: "prod_pro",
  POLAR_PRODUCT_MAX: "prod_max",
  POLAR_PRODUCT_ULTRA: "prod_ultra",
};

describe("productIdForPlan / planForProductId", () => {
  for (const plan of PLANS) {
    test(`round-trips ${plan} through the injected env record`, () => {
      const productId = productIdForPlan(plan, ENV);
      expect(productId).toBe(`prod_${plan}`);
      expect(planForProductId(productId!, ENV)).toBe(plan);
    });
  }

  test("returns null for a product id that is not configured", () => {
    expect(planForProductId("prod_from_the_other_environment", ENV)).toBeNull();
  });

  // Sandbox and production hold different ids, so an unset variable must not silently
  // match a product id that happens to be undefined too.
  test("returns null for every plan when nothing is configured", () => {
    for (const plan of PLANS) expect(productIdForPlan(plan, {})).toBeNull();
    expect(planForProductId("prod_free", {})).toBeNull();
  });
});

describe("isPaidPlan", () => {
  test("excludes free, so /api/checkout and /api/plan can never resolve the free product", () => {
    expect(isPaidPlan("free")).toBe(false);
  });

  test.each(["pro", "max", "ultra"])("accepts %s", (plan) => {
    expect(isPaidPlan(plan)).toBe(true);
  });

  test.each(["", "FREE", "enterprise", null, 1, { plan: "pro" }])("rejects %p", (value) => {
    expect(isPaidPlan(value)).toBe(false);
  });
});

describe("toPlan", () => {
  for (const plan of PLANS) {
    test(`accepts the stored label ${plan}`, () => {
      expect(toPlan(plan)).toBe(plan);
    });
  }

  test.each([null, undefined, "", "gold", 3])("maps the unrecognized column value %p to null", (value) => {
    expect(toPlan(value)).toBeNull();
  });
});
