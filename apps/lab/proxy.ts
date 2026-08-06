import { NextResponse, type NextRequest } from "next/server";

import { isHoldingEnabled } from "@seri/ui/holding-flag";

/*
 * The whole of the holding mechanism for this site: while SERI_COMING_SOON is set, `/` serves
 * app/holding/page.tsx instead of app/page.tsx. Deciding it here rather than in the page is
 * what keeps `/` statically prerendered and the page component free of any environment read —
 * a `process.env` branch inside a prerendered page is answered at build time, not per request.
 *
 * The matcher is an allowlist of exactly one path rather than a catch-all with exclusions,
 * which is strictly stronger: _next/static, _next/image and favicon.ico are outside it by
 * construction rather than by anyone remembering to name them.
 *
 * There is no rewrite loop, for three independent reasons: NextResponse.rewrite is internal so
 * middleware does not re-run for the rewritten path; /holding is not in the matcher; and the
 * pathname check below refuses anything that is not `/`, so a future widening of the matcher
 * still cannot rewrite a second time.
 */
export default function proxy(request: NextRequest) {
  if (!isHoldingEnabled()) return NextResponse.next();
  if (request.nextUrl.pathname !== "/") return NextResponse.next();
  return NextResponse.rewrite(new URL("/holding", request.url));
}

export const config = { matcher: ["/"] };
