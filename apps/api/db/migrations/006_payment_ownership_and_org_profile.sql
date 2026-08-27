alter table organizations add column if not exists country text;
alter table organizations add column if not exists address text;
alter table organizations add column if not exists website text;
alter table organizations add column if not exists contact_email text;
alter table organizations add column if not exists phone text;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete restrict,
  payment_request_id uuid not null references payment_requests(id) on delete restrict,
  payer_user_id uuid references users(id) on delete set null,
  payer_wallet_address text,
  transaction_hash text not null unique,
  amount_minor bigint not null check (amount_minor > 0),
  token_symbol text not null default 'USDC' check (token_symbol = 'USDC'),
  chain_caip2 text not null default 'eip155:5042002',
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED', 'REFUNDED')),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists payments_payer_user_idx on payments(payer_user_id, confirmed_at desc);
create index if not exists payments_invoice_idx on payments(invoice_id, confirmed_at desc);
