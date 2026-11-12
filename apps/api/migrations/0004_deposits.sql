-- Verdict-gated supplier deposits through PayPal. Run after 0003_credits.sql (safe to run twice).
--
-- A deposit is only ever created from a finished verification report, and the report's decision decides what PayPal
-- is asked to do: PROCEED pays the supplier now (Orders v2, intent CAPTURE), VERIFY_FIRST only holds the buyer's funds
-- (intent AUTHORIZE) until the buyer releases (captures) or cancels (voids) the hold, and STOP creates nothing.
-- `reviews` keeps every AI review of the supplier's proof, so a release can be traced to the evidence behind it.

create table if not exists deposits (
  id               uuid primary key,
  user_id          uuid references users (id) on delete set null,
  run_id           text not null,
  supplier_name    text not null default '',
  decision         text not null check (decision in ('PROCEED', 'VERIFY_FIRST')),
  mode             text not null check (mode in ('pay', 'hold')),
  amount           numeric(12, 2) not null check (amount > 0),
  currency         text not null,
  payee_email      text,
  paypal_order_id  text unique,
  authorization_id text unique,
  capture_id       text unique,
  status           text not null default 'created'
                   check (status in ('created', 'pending', 'paid', 'held', 'released', 'voided', 'cancelled', 'failed', 'refunded')),
  payer_email      text,
  expires_at       timestamptz,
  tracking         jsonb,
  reviews          jsonb not null default '[]'::jsonb,
  timeline         jsonb not null default '[]'::jsonb,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists deposits_user on deposits (user_id, created_at desc);
create index if not exists deposits_run on deposits (run_id);

-- PayPal webhook deliveries already handled, so a redelivered event is applied once.
create table if not exists paypal_events (
  id          text primary key,
  event_type  text not null,
  resource_id text,
  received_at timestamptz not null default now()
);

alter table deposits enable row level security;
alter table paypal_events enable row level security;
