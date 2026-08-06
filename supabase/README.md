# supabase

## Migrations

`migrations/20260802212049_create_account_status.sql`,
`migrations/20260804165555_account_status_add_plan_and_revoke_public_grants.sql`, and
`migrations/20260804195244_provisioning_claims_idempotency_barrier.sql` are transcriptions of
migrations already applied in production, read verbatim from
`supabase_migrations.schema_migrations`. Never edit them — if one turns out to diverge from what
actually ran, correct the file, but do not re-apply it.

`migrations/20260806000001_account_status_enable_rls.sql` closes a gap between the migration
history and production: RLS was enabled on `account_status` through the dashboard, out of band, so
replaying the three files above on an empty database yields RLS off. This file is a no-op against
the live database and makes the history replayable.

New migrations use the `YYYYMMDDHHMMSS_name.sql` convention (`supabase migration new <name>`).

## Applying

```
supabase link --project-ref <project-ref>
supabase db push
```

`migrations/20260806000002_usage_events.sql` (the `usage_events` table) is unapplied and has no
writer yet — its writer is the gateway (Stage 7, unstarted).
