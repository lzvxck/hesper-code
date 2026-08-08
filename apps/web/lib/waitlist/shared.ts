// Zero dependencies, deliberately: WaitlistForm.tsx ("use client") imports only this constant,
// never lib/waitlist/server.ts, which pulls in zod and the Supabase SDK. That split is what
// keeps those two out of /holding's client bundle — see server.ts for the rest of this story.
export const HONEYPOT_FIELD = "company";
