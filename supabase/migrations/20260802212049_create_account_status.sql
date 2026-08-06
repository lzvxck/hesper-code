create table account_status (
  workos_user_id       text primary key,
  email                 text,
  polar_customer_id     text,
  subscription_status    text not null default 'none'
    check (subscription_status in ('none', 'active', 'canceled', 'past_due', 'revoked')),
  updated_at             timestamptz not null default now()
);
create index on account_status (polar_customer_id);
