import { afterEach, describe, expect, test } from "bun:test";
import { portalOrigin } from "../lib/origin";

const VAR = "NEXT_PUBLIC_WORKOS_REDIRECT_URI";
const original = process.env[VAR];

/*
 * Restored by deletion when it started out unset. Assigning the captured `undefined` back
 * would store the literal string "undefined" and poison every later test in this process —
 * the exact failure `.claude/rules/code-quality.md` records from CI.
 */
afterEach(() => {
  if (original === undefined) delete process.env[VAR];
  else process.env[VAR] = original;
});

describe("portalOrigin", () => {
  test("takes the origin of the configured redirect URI, dropping its path", () => {
    process.env[VAR] = "https://portal.seriora.ai/callback";

    expect(portalOrigin()).toBe("https://portal.seriora.ai");
  });

  /*
   * The unset case is not covered by CI's operating-system matrix: every runner and every dev
   * box that has ever built this app had the variable set. It reaches production through a
   * build made without it — a first Vercel deploy, or the variable added after the build.
   */
  test("names the variable and the build-time inlining when it is unset", () => {
    delete process.env[VAR];

    expect(() => portalOrigin()).toThrow(/NEXT_PUBLIC_WORKOS_REDIRECT_URI was not set.*build/);
  });
});
