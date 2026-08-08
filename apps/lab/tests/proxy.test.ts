import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

import proxy from "../proxy";

const ORIGIN = "https://seriora.ai";

/*
 * A rewrite is a `next()` carrying x-middleware-rewrite; both are 200s with no body, so the
 * status says nothing and the header is the only thing that distinguishes them.
 */
const rewriteTarget = (pathname: string) => {
  const header = proxy(new NextRequest(`${ORIGIN}${pathname}`)).headers.get("x-middleware-rewrite");
  return header === null ? null : new URL(header).pathname;
};

/*
 * Set and DELETED per case rather than reassigned. `process.env.X = undefined` stores the
 * literal string "undefined", which is truthy to any naive read and leaks into every later
 * test in the same process — a bug this repo has already shipped twice
 * (.claude/rules/code-quality.md).
 */
beforeEach(() => {
  process.env.SERI_COMING_SOON = "1";
});

afterEach(() => {
  delete process.env.SERI_COMING_SOON;
});

/*
 * This app's proxy.ts is byte-identical in behaviour to apps/web's and had no test at all,
 * which made its comment's claim about "the second, independent guard, and it is what the test
 * actually exercises" true on web and false here. The installer case is web's alone — those
 * rewrites live in apps/web/next.config.ts and this app has none — so it is the one case not
 * carried over.
 */
describe("apps/lab proxy", () => {
  test("serves the holding page at / while the flag is set", () => {
    expect(rewriteTarget("/")).toBe("/holding");
  });

  /*
   * The inner pathname guard, which is the reason a rewrite loop is impossible even if someone
   * later widens the matcher off `["/"]`. Rewriting /holding to /holding is the shape that
   * loops, so it is the path worth naming.
   */
  test("leaves any path that is not / alone while the flag is set", () => {
    expect(rewriteTarget("/holding")).toBeNull();
    expect(rewriteTarget("/opengraph-image.jpg")).toBeNull();
  });

  test("rewrites nothing while the flag is unset", () => {
    delete process.env.SERI_COMING_SOON;

    expect(rewriteTarget("/")).toBeNull();
  });

  /*
   * The waitlist form POSTs to a Server Action at `/`. This pins the middleware half of that
   * path — a POST still rewrites to /holding — but it does NOT close the open question of
   * whether Next resolves the Server Action reference across that rewrite; the e2e test does.
   */
  test("still rewrites a POST to / while the flag is on", () => {
    const header = proxy(new NextRequest(`${ORIGIN}/`, { method: "POST" })).headers.get(
      "x-middleware-rewrite",
    );
    expect(header === null ? null : new URL(header).pathname).toBe("/holding");
  });
});
