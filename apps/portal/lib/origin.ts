/*
 * This deployment's own origin, taken from configuration rather than from the request.
 *
 * It feeds the checkout's successUrl and the customer portal's returnUrl, which are where a
 * paying customer is sent when Polar is done with them. Deriving those from the request's
 * Host header means a host-header-poisoned request decides that destination. The AuthKit
 * redirect URI is already required, WorkOS validates it against a registered allowlist, and
 * its origin is by definition this portal's — so no new variable is needed.
 *
 * NEXT_PUBLIC_* variables are inlined by Next at build time, so this value is fixed when
 * `next build` runs and setting it in the runtime environment afterwards does not reach this
 * code. That is worth an explicit error rather than the `TypeError: Invalid URL` that
 * `new URL(undefined)` produces: this runs inside route handlers, where error.tsx does not
 * catch it, so the customer meets a bare 500 mid-purchase and the log has to be the thing
 * that says why.
 */
export function portalOrigin(): string {
  const redirectUri = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error(
      "NEXT_PUBLIC_WORKOS_REDIRECT_URI was not set when this app was built. Next inlines " +
        "NEXT_PUBLIC_* at build time, so setting it in the runtime environment does not fix " +
        "this — set it in the build environment and rebuild.",
    );
  }
  return new URL(redirectUri).origin;
}
