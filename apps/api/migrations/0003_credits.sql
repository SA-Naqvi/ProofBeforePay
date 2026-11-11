-- ProofBeforePay credits and PayPal purchases. Run after 0002_accounts.sql (safe to run twice).
--
-- credit_ledger is append-only: a user's balance is the sum of their rows. `ref` is unique, so replaying an event
-- (a retried PayPal capture, a second refund for the same run) can never apply twice. Rows survive account deletion
-- (user_id becomes null) because they are payment records. Row-level security is on with no policies, as elsewhere.

create table if not exists credit_ledger (
  id         uuid primary key,
  user_id    uuid references users (id) on delete set null,
  delta      int not null,
  reason     text not null,
  ref        text not null unique,  -- 'paypal:<order>', 'run:<id>', 'refund:<id>', 'signup:<user>'
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_user on credit_ledger (user_id, created_at desc);

create table if not exists payment_orders (
  id              uuid primary key,
  user_id         uuid references users (id) on delete set null,
  pack_id         text not null,
  credits         int not null,
  amount          numeric(10, 2) not null,
  currency        text not null,
  paypal_order_id text not null unique,
  status          text not null default 'created' check (status in ('created', 'pending', 'completed', 'failed')),
  capture_id      text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index if not exists payment_orders_user on payment_orders (user_id, created_at desc);

alter table credit_ledger enable row level security;
alter table payment_orders enable row level security;
