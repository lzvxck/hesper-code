-- Append-only usage ledger. No writer exists yet — the gateway that will insert into this
-- table is Stage 7 of build-plan.md, unstarted. A row count of zero here means "waiting",
-- not "broken".
--
-- `idempotency_key` is unique because the writer will be `insert ... on conflict do
-- nothing`, never `update balance = balance - n`: same reasoning as provisioning_claims'
-- primary key (20260804195244) — the ledger, not an update statement, is the barrier.
--
-- `upstream_route` and `cache_read_tokens` are not optional (pricing-tiers.md:541-553):
-- "Both are one column now and unreconstructable later." Cache reads are the difference
-- between a user sitting at 20% and at 100% of the same allowance for identical behaviour,
-- and a route swap traced after the fact needs the route recorded per request, not inferred.
--
-- `cost_usd` is `numeric(12,6)`, never `float`/`real`/`double precision`: this column is
-- summed to decide whether a customer is cut off at their spend cap, and binary floating
-- point drifts under repeated summation in a way a billing cutoff cannot tolerate.
create table public.usage_events (
  id                   bigint generated always as identity primary key,
  idempotency_key      text        not null unique,
  workos_user_id       text        not null,
  billing_mode         text        not null check (billing_mode in ('subscription', 'byok')),
  provider             text        not null,
  upstream_route       text        not null,
  model_id             text        not null,
  input_tokens         integer     not null,
  output_tokens        integer     not null,
  cache_read_tokens    integer     not null,
  cost_usd             numeric(12,6) not null,
  request_id           text,
  created_at           timestamptz not null default now(),
  synced_to_billing_at timestamptz
);

create index usage_events_user_time
  on public.usage_events (workos_user_id, created_at desc);
create index usage_events_user_model_time
  on public.usage_events (workos_user_id, model_id, created_at desc);

-- Same posture as account_status and provisioning_claims: RLS on with zero policies, no
-- privileges for the browser-facing roles. Only the future gateway, connecting with the
-- service role, will write here.
alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;
