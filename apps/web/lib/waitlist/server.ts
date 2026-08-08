import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase";
import { HONEYPOT_FIELD } from "./shared";

export type WaitlistState = { status: "idle" | "ok" | "error"; message: string };

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** Normalised address, or null if the input is not one. */
export function parseEmail(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const result = emailSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** True when the CSS-hidden field came back non-empty — i.e. a bot filled every input. */
export function isHoneypotTripped(form: FormData): boolean {
  const value = form.get(HONEYPOT_FIELD);
  return typeof value === "string" && value.length > 0;
}

export async function addToWaitlist(
  email: string,
  source: string,
  supabase: SupabaseClient = getSupabaseClient(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("waitlist_signups").insert({ email, source });
  if (!error) return { ok: true };
  // Duplicate address is success, not failure — see waitlistCopy.ts.
  const code = (error as { code?: unknown }).code;
  if (code === "23505") return { ok: true };
  console.error("addToWaitlist failed", code, error.message);
  return { ok: false, error: typeof code === "string" ? code : error.message };
}
