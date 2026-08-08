import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

import proxy from "../proxy";

const ORIGIN = "https://seri-agent.seriora.ai";

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

describe("apps/web proxy", () => {
  test("serves the holding page at / while the flag is set", () => {
    expect(rewriteTarget("/")).toBe("/holding");
  });

  /*
   * The installers are the reason the matcher is an allowlist of one path. They are not files
   * in this app at all — next.config.ts rewrites them out to raw.githubusercontent.com in the
   * `afterFiles` phase, which runs after middleware, so a catch-all matcher would swallow both
   * the moment the flag went on and the documented install command would start returning a
   * holding page. This exercises the second, independent guard: the pathname check inside the
   * function, which holds even if the matcher is later widened.
   */
  test("leaves both installer paths alone while the flag is set", () => {
    expect(rewriteTarget("/install.sh")).toBeNull();
    expect(rewriteTarget("/install.ps1")).toBeNull();
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
