import { describe, expect, test } from "bun:test";

import { assertClean } from "../src/index";

/*
 * The pattern lists had no test of their own at all — the two sites' suites exercised them
 * only through their own copy, so nothing pinned what the policy accepts and rejects in
 * isolation. These cases exist because of the "Coming soon" exemption: an allowlist is only
 * as good as the proof that it did not widen anything else, and that proof cannot live in a
 * page's copy test, which passes for either policy.
 */
describe("the Coming soon exemption", () => {
  test("admits the exact phrase the holding page is built around", () => {
    expect(() => assertClean("Coming soon")).not.toThrow();
  });

  // Case-insensitive on purpose: the phrase is a sentence opener on one site and mid-sentence
  // elsewhere, and the policy is about the claim, not the capitalisation.
  test("admits it whatever its case", () => {
    expect(() => assertClean("coming soon")).not.toThrow();
  });

  /*
   * The case that proves the hole is two words wide and not one. `\bsoon\b` was chosen over
   * `coming soon` in the first place because the broader pattern subsumes the narrower —
   * "landing soon" and "available soon" are the same promise — and that reasoning has to
   * survive the exemption.
   */
  test("still rejects a bare soon", () => {
    expect(() => assertClean("Available soon")).toThrow();
    expect(() => assertClean("Landing soon")).toThrow();
  });

  test("leaves the rest of the futurity list untouched", () => {
    expect(() => assertClean("On our roadmap")).toThrow();
    expect(() => assertClean("planned for later")).toThrow();
  });

  /*
   * The mask is applied to the FUTURITY scan and nowhere else, so it cannot launder a claim
   * that merely shares a sentence with the exempted phrase. Both offending patterns are named
   * in the failure, which is the assertion — a bare toThrow() here would also pass if the
   * string had failed for some unrelated reason.
   */
  test("cannot launder an overclaim standing next to it", () => {
    const overclaiming = () => assertClean("Coming soon — the first fully autonomous agent");

    expect(overclaiming).toThrow("/the first/i");
    expect(overclaiming).toThrow("/fully autonomous/i");
  });
});
