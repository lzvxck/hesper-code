/*
 * This deployment's own origin, taken from configuration rather than from the request.
 *
 * It feeds the checkout's successUrl and the customer portal's returnUrl, which are where a
 * paying customer is sent when Polar is done with them. Deriving those from the request's
 * Host header means a host-header-poisoned request decides that destination. The AuthKit
 * redirect URI is already required, WorkOS validates it against a registered allowlist, and
 * its origin is by definition this portal's — so no new variable is needed.
 */
export function portalOrigin(): string {
  return new URL(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI!).origin;
}
