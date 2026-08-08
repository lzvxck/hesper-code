// Type-only: erased before the bundler ever sees it, so importing it here does not pull
// server.ts's real dependencies (zod, Supabase) into this file.
import type { WaitlistState } from "./server";

// Zero runtime dependencies, deliberately: WaitlistForm.tsx ("use client") imports only this
// module, never lib/waitlist/server.ts, which pulls in zod and the Supabase SDK. That split is
// what keeps those two out of /holding's client bundle.
export const HONEYPOT_FIELD = "company";

export const WAITLIST_INITIAL: WaitlistState = { status: "idle", message: "" };
