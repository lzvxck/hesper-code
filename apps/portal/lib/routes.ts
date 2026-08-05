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

export function isFreshLoad(params: Record<string, string | string[] | undefined>): boolean {
  return params[UPDATED_PARAM] !== undefined;
}
