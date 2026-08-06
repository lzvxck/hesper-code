import { NextResponse, type NextRequest } from "next/server";

import { isHoldingEnabled } from "@seri/ui/holding-flag";

/*
 * The whole of the holding mechanism for this site: while SERI_COMING_SOON is set, `/` serves
 * app/holding/page.tsx instead of app/page.tsx. Deciding it here rather than in the page is
 * what keeps `/` statically prerendered and the page component free of any environment read —
 * a `process.env` branch inside a prerendered page is answered at build time, not per request.
 *
 * The matcher is an allowlist of exactly one path rather than a catch-all with exclusions, and
 * on this site that is load-bearing rather than tidy: next.config.ts rewrites /install.sh and
 * /install.ps1 out to raw.githubusercontent.com, those rewrites run in the `afterFiles` phase
 * which is AFTER middleware, and a catch-all matcher would swallow both installers the moment
 * the flag went on. tests/proxy.test.ts exercises the pathname check below for the same two
 * paths, so the guard survives a future widening of the matcher.
 *
 * There is no rewrite loop, for three independent reasons: NextResponse.rewrite is internal so
 * middleware does not re-run for the rewritten path; /holding is not in the matcher; and the
 * pathname check refuses anything that is not `/`.
 */
export default function proxy(request: NextRequest) {
  if (!isHoldingEnabled()) return NextResponse.next();
  if (request.nextUrl.pathname !== "/") return NextResponse.next();
  return NextResponse.rewrite(new URL("/holding", request.url));
}

export const config = { matcher: ["/"] };
