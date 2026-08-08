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
