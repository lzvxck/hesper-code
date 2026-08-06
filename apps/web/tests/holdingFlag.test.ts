import { afterEach, describe, expect, test } from "bun:test";

import { isHoldingEnabled } from "@seri/ui/holding-flag";

/*
 * The truthiness rule carries the whole of D1 and was completely unpinned: replacing the body
 * of isHoldingEnabled with `Boolean(process.env.SERI_COMING_SOON)` left all 578 tests on this
 * branch green. That naive form is exactly the bug the rule was written out to avoid — Vercel
 * stores every environment variable as a string, so `"false"` in the dashboard would switch the
 * holding ON and take all three sites dark with a green suite.
 *
 * It lives in an app's tests/ because packages/ui has no `test` script and is absent from the
 * root chain, and this loop deliberately did not add one; the module it covers is shared by
 * lab, web and portal, so nothing here is web-specific.
 *
 * Teardown DELETES rather than reassigning: `process.env.X = undefined` stores the literal
 * string "undefined", which is why that string is one of the off values asserted below.
 */
afterEach(() => {
  delete process.env.SERI_COMING_SOON;
});

describe("isHoldingEnabled", () => {
  test("is on for the two affirmatives, whatever their case or surrounding space", () => {
    for (const value of ["1", "true", "TRUE", "True", " TRUE ", " 1 ", "\ttrue\n"]) {
      process.env.SERI_COMING_SOON = value;
      expect(isHoldingEnabled()).toBe(true);
    }
  });

  /*
   * "false" and "0" are the ones that matter: they are what an operator types to turn the
   * holding OFF, and under a naive Boolean() check both are non-empty strings and so turn it
   * ON. "undefined" is here because that is what a teardown reassigning `undefined` leaves
   * behind.
   */
  test("is off for every other value, including the strings 'false' and '0'", () => {
    for (const value of ["false", "FALSE", "0", "", " ", "no", "off", "undefined", "2", "yes"]) {
      process.env.SERI_COMING_SOON = value;
      expect(isHoldingEnabled()).toBe(false);
    }
  });

  test("is off when the variable is not set at all", () => {
    delete process.env.SERI_COMING_SOON;

    expect(isHoldingEnabled()).toBe(false);
  });
});
