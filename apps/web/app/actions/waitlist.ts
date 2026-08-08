"use server";

import { addToWaitlist, isHoneypotTripped, parseEmail } from "@/lib/waitlist";
import { WAITLIST_COPY } from "@/lib/waitlistCopy";

// A type-only export is erased before the bundler ever sees it, so it does not trip the
// "use server" file's actual rule below. WAITLIST_INITIAL is a plain object rather than an
// async function and cannot live here for the same reason — see lib/waitlistCopy.ts.
export type WaitlistState = { status: "idle" | "ok" | "error"; message: string };

export async function submitWaitlistEmail(
  _prev: WaitlistState,
  form: FormData,
): Promise<WaitlistState> {
  // A bot fills every input, so a non-empty honeypot short-circuits before any parse or insert
  // — no distinguishable response, so probing this field back tells an attacker nothing.
  if (isHoneypotTripped(form)) return { status: "ok", message: WAITLIST_COPY.ok };

  const email = parseEmail(form.get("email"));
  if (!email) return { status: "error", message: WAITLIST_COPY.invalid };

  try {
    const result = await addToWaitlist(email, "holding");
    if (result.ok) return { status: "ok", message: WAITLIST_COPY.ok };
    return { status: "error", message: WAITLIST_COPY.failed };
  } catch {
    // getSupabaseClient() throws outright when the env vars are absent, which is the production
    // state until a human sets them (see Rollout) — so this is not defensive padding.
    return { status: "error", message: WAITLIST_COPY.failed };
  }
}
