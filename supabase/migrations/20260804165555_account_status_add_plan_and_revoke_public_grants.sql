-- The portal needs to distinguish Pro from Max; `subscription_status = 'active'` cannot.
-- Nullable: null means "no product mapped yet", which is what an unrecognised Polar
-- product id resolves to. Written only by the Polar webhook in apps/server.
alter table public.account_status add column if not exists plan text;

-- `anon` and `authenticated` held every privilege on this table, including DELETE and
-- TRUNCATE, while RLS was enabled with zero policies — closed only by accident. Both
-- writers (the webhook and the portal) connect with the service role, which bypasses RLS
-- and grants alike, so nothing legitimate loses access. Revoked in the same migration
-- that adds the column so no window exists where a grant is reachable.
revoke all on public.account_status from anon, authenticated;
