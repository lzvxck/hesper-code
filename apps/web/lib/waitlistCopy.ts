import type { WaitlistState } from "@/app/actions/waitlist";

/*
 * Not in app/actions/waitlist.ts, deliberately: a "use server" file may only export async
 * functions (measured against the real dev/production server, not just typecheck or `next
 * build` — both of those passed while this crashed every real submission with a 500, "A 'use
 * server' file can only export async functions, found object"). WaitlistState stays a type-only
 * export there, which is erased before the bundler ever sees it and so never trips that rule;
 * WAITLIST_INITIAL is a plain object and has to live somewhere else. This module is already
 * imported by the component, the action and the tests, so it costs nothing new.
 */
export const WAITLIST_INITIAL: WaitlistState = { status: "idle", message: "" };

export const WAITLIST_COPY = {
  label: "Email address",
  placeholder: "you@example.com",
  submit: "Join the waitlist",
  consent: "One email when seri is available, and nothing else. Leave the list at any time.",
  privacyLink: "Privacy",
  // Identical for a new address and one already stored — phrased as a state, not an event, so
  // the response cannot be used to test whether an address is already on the list.
  ok: "You're on the list.",
  invalid: "That does not look like an email address.",
  // Also the answer to a rotated Server Action id after a redeploy: retry-friendly, not a dead end.
  failed: "That did not go through. Refresh the page and try again.",
} as const;
