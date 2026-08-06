-- Polar exposes no idempotency key: `subscriptions.create` takes only
-- {metadata, productId, externalCustomerId}, and it accepted 18 duplicate free
-- subscriptions for one customer in 3.3 seconds when a single browser navigation fanned
-- out into parallel renders. Since the provider cannot dedupe, the barrier lives here.
-- The primary key is the barrier: `insert ... on conflict do nothing` is atomic, holds no
-- lock across the outbound HTTP call to Polar, and works across serverless instances.
create table if not exists public.provisioning_claims (
  workos_user_id text primary key,
  state          text not null default 'pending' check (state in ('pending', 'done')),
  claimed_at     timestamptz not null default now()
);

-- `pending` is not terminal. A claimant that dies between claiming and creating the
-- subscription would otherwise lock that user out of provisioning forever, so a stale
-- pending claim is reclaimable; `claimed_at` is what makes staleness decidable.
create index if not exists provisioning_claims_stale_idx
  on public.provisioning_claims (state, claimed_at);

-- Same posture as account_status: reached only by the service role. RLS on with zero
-- policies, and no privileges for the browser-facing roles.
alter table public.provisioning_claims enable row level security;
revoke all on public.provisioning_claims from anon, authenticated;
