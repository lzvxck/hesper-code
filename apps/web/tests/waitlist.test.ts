import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { HONEYPOT_FIELD, WAITLIST_INITIAL } from "../lib/waitlist/shared";
import { addToWaitlist, isHoneypotTripped, parseEmail } from "../lib/waitlist/server";
import { WAITLIST_COPY } from "../lib/waitlistCopy";
import { submitWaitlistEmail } from "../app/actions/waitlist";

/*
 * A hand-written fake cast to SupabaseClient, in the shape
 * apps/portal/tests/accountStatus.test.ts uses — not `mock.module`, which registers
 * process-wide and does not unwind cleanly (see that file's own comment).
 */
function fakeSupabase(response: { error: unknown }) {
  const inserted: unknown[] = [];
  const client = {
    from: () => ({
      insert: (row: unknown) => {
        inserted.push(row);
        return Promise.resolve(response);
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, inserted };
}

const postgrestError = (code: string) => ({ message: `insert failed (${code})`, details: "", hint: "", code });

describe("parseEmail", () => {
  test("normalizes", () => {
    expect(parseEmail("  Foo@Example.COM  ")).toBe("foo@example.com");
  });

  test("rejects a non-address", () => {
    expect(parseEmail("nope")).toBeNull();
    expect(parseEmail("")).toBeNull();
    expect(parseEmail(null)).toBeNull();
  });

  test("caps length", () => {
    expect(parseEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
  });
});

describe("addToWaitlist", () => {
  test("inserts the normalized row", async () => {
    const { client, inserted } = fakeSupabase({ error: null });

    expect(await addToWaitlist("foo@example.com", "holding", client)).toEqual({ ok: true });
    expect(inserted[0]).toEqual({ email: "foo@example.com", source: "holding" });
  });

  test("duplicate is success", async () => {
    const { client } = fakeSupabase({ error: postgrestError("23505") });

    expect(await addToWaitlist("foo@example.com", "holding", client)).toEqual({ ok: true });
  });

  test("a real error is an error", async () => {
    const { client } = fakeSupabase({ error: postgrestError("42501") });

    expect((await addToWaitlist("foo@example.com", "holding", client)).ok).toBe(false);
  });

  test("success and duplicate copy are identical and state-phrased", async () => {
    expect(WAITLIST_COPY.ok).not.toMatch(/thank|added|signed up|welcome/i);

    const fresh = fakeSupabase({ error: null });
    const duplicate = fakeSupabase({ error: postgrestError("23505") });

    // The same mapping submitWaitlistEmail applies to addToWaitlist's result: ok -> WAITLIST_COPY.ok.
    const toMessage = (result: { ok: boolean }) => (result.ok ? WAITLIST_COPY.ok : WAITLIST_COPY.failed);

    expect(toMessage(await addToWaitlist("foo@example.com", "holding", fresh.client))).toEqual(
      toMessage(await addToWaitlist("foo@example.com", "holding", duplicate.client)),
    );
  });
});

describe("honeypot", () => {
  /*
   * Set and DELETED per case rather than reassigned. `process.env.X = undefined` stores the
   * literal string "undefined", which is truthy to any naive read and leaks into every later
   * test in the same process — a bug this repo has already shipped twice
   * (.claude/rules/code-quality.md).
   */
  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  // With no env present, getSupabaseClient() throws, so a pass here is itself the proof that no
  // client was constructed and no insert attempted.
  test("skips the insert entirely — no client is constructed", async () => {
    const form = new FormData();
    form.set("email", "foo@example.com");
    form.set(HONEYPOT_FIELD, "http://spam.example");

    expect(isHoneypotTripped(form)).toBe(true);
    expect(await submitWaitlistEmail(WAITLIST_INITIAL, form)).toEqual({ status: "ok", message: WAITLIST_COPY.ok });
  });

  // Negative control: the same call with the honeypot empty reaches the real client, which
  // throws with no env present — proving the honeypot branch above is what short-circuited.
  test("an empty honeypot does not skip the insert", async () => {
    const form = new FormData();
    form.set("email", "foo@example.com");
    form.set(HONEYPOT_FIELD, "");

    expect(isHoneypotTripped(form)).toBe(false);
    expect(await submitWaitlistEmail(WAITLIST_INITIAL, form)).toEqual({ status: "error", message: WAITLIST_COPY.failed });
  });
});
