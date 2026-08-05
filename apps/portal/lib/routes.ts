/*
 * The one place the freshness marker is spelled.
 *
 * It travels between three files that never call each other — billing.ts and the customer
 * portal route produce it, page.tsx reads it — so it is a protocol, and a protocol written as
 * a literal at each end is one rename away from compiling perfectly and silently doing
 * nothing. `isFreshLoad` exists so the consumer names the same symbol the producers do rather
 * than matching on a string it happens to agree with.
 *
 * What it means is in provisioning.ts, above the fast path: the row is written by the webhook
 * asynchronously, so for a moment after any change it still describes the previous state.
 */
const UPDATED_PARAM = "updated";

export const ACCOUNT_UPDATED = `/?${UPDATED_PARAM}=1`;

// Spelled once for the same reason: the control and the page it reaches are in different
// files, and a literal at each end survives a rename of either, silently.
export const USAGE = "/usage";

export function isFreshLoad(params: Record<string, string | string[] | undefined>): boolean {
  return params[UPDATED_PARAM] !== undefined;
}

/*
 * Nothing strips the marker: a refresh keeps it, every mutation redirects back to it, the
 * customer portal returns to it, and the wordmark is an in-page anchor — so no link on the
 * page reaches a markerless `/`. That is fine while the answer is a plan, and a trap when it
 * is not.
 *
 * A fresh load resolving to no plan is the ambiguous moment: either Polar has not published a
 * just-completed checkout yet, or the customer abandoned one after their Free subscription had
 * already been revoked to make room for it. The second holds no subscription at all, and its
 * only repair lives on the ordinary path, which `fresh` deliberately skips. Left sticky, that
 * customer sits on "a plan we no longer offer" with nothing selectable, no Resume and no Free,
 * and refreshing never gets them out.
 *
 * So the marker gets exactly one load. Reloading without it costs a redirect and resolves both
 * readings correctly: the repair runs, and a checkout that has since become visible is read
 * from Polar anyway, because a revoked row does not satisfy the fast path.
 */
export function needsMarkerlessReload(fresh: boolean, plan: unknown): boolean {
  return fresh && plan === null;
}
