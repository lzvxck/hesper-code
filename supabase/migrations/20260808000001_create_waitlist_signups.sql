-- Waitlist addresses captured by apps/web's holding page. Write-only for now: nothing reads
-- this table and nothing sends from it, so a row is a promise nobody has kept yet.
--
-- `email` is a plain unique text column with a lower() check rather than citext, and rather
-- than a unique index on lower(email): citext carries collation/search_path footguns, and a
-- functional unique index is not something PostgREST can name as an onConflict target. The
-- application lowercases before insert; the check is what stops a second writer from not.
--
-- Same posture as account_status, provisioning_claims and usage_events: RLS on with zero
-- policies and no privileges for the browser-facing roles. Identity here is WorkOS, not
-- Supabase auth, so the service role is the only writer that will ever exist.
create table public.waitlist_signups (
  id         bigint generated always as identity primary key,
  email      text not null unique check (email = lower(email)),
  source     text,
  created_at timestamptz not null default now()
);

alter table public.waitlist_signups enable row level security;
revoke all on public.waitlist_signups from anon, authenticated;
