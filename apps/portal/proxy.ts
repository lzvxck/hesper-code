import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { isHoldingEnabled } from "@seri/ui/holding-flag";

import { BILLING, PLANS, USAGE } from "./lib/routes";

const HOLDING = "/holding";

/*
 * The three signed-in pages, and only those. Built from lib/routes.ts's constants rather than
 * from string literals so a route rename cannot leave this guarding a path that no longer
 * exists. /api/* is deliberately absent: all six API routes keep reaching authkitProxy and
 * keep calling getSessionUser(), because a holding page is not a reason to open an endpoint
 * that spends money. tests/holding.test.ts covers that by unit call and the loop's HTTP matrix
 * covers it again over the wire.
 */
const HELD = new Set<string>([PLANS, BILLING, USAGE]);

const authkit = authkitProxy({ middlewareAuth: { enabled: true, unauthenticatedPaths: [] } });

/*
 * Next 16 renamed middleware.ts to proxy.ts, and authkit-nextjs 4 renamed the helper to
 * match — `authkitMiddleware` is still exported but deprecated.
 *
 * `middlewareAuth` makes every matched route secure by default rather than relying on each
 * page remembering to call withAuth, and `unauthenticatedPaths` stays empty: no path is
 * exempted from auth here, including /holding. The three held routes reach the holding page by
 * rewrite, and a rewrite is internal — the response is the holding page's markup served under
 * the URL the visitor asked for, not a redirect to a URL they could then request directly.
 * /callback is excluded by the matcher instead, since it is what establishes the session in
 * the first place, and the static paths are excluded because a catch-all matcher intercepts
 * them and breaks Tailwind's stylesheet.
 *
 * While SERI_COMING_SOON is set the holding branch runs FIRST, ahead of authkit, which is the
 * point: an unauthenticated visitor to `/`, /billing or /usage gets the holding page with a
 * 200 rather than the 307 to WorkOS they get today.
 *
 * There is no `pathname === HOLDING` escape hatch, and it is not needed: NextResponse.rewrite
 * is internal, so middleware does not re-run for the rewritten path and cannot loop. Measured
 * on a running build with the flag set — `/` answers 200 with the holding markup while a
 * direct GET /holding answers 307 to WorkOS. Leaving /holding behind auth is the stricter of
 * the two behaviours and costs the holding nothing.
 *
 * `authkitProxy()` returns a NextMiddleware, so `authkit(request, event)` is exactly the call
 * this module's default export used to be — with the flag unset this file is behaviourally
 * byte-equivalent to what it replaced.
 */
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isHoldingEnabled()) {
    if (HELD.has(request.nextUrl.pathname)) {
      return NextResponse.rewrite(new URL(HOLDING, request.url));
    }
  }
  return authkit(request, event);
}

// `callback$` and not `callback`: the bare prefix would also exempt /callbackfoo, which is
// an ordinary protected route this app happens not to have yet.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|callback$).*)"],
};
