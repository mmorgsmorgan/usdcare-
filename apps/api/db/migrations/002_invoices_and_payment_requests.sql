create sequence if not exists invoice_number_sequence start 1000;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  created_by_user_id uuid not null references users(id) on delete restrict,
  invoice_number text not null default ('INV-' || lpad(nextval('invoice_number_sequence')::text, 6, '0')),
  patient_reference text not null,
  service_description text not null,
  amount_minor bigint not null check (amount_minor > 0),
  token_symbol text not null default 'USDC' check (token_symbol = 'USDC'),
  chain_caip2 text not null default 'eip155:8453' check (chain_caip2 = 'eip155:8453'),
  status text not null default 'AWAITING_PAYMENT' check (status in (
    'CREATED',
    'AWAITING_PAYMENT',
    'PAYMENT_DETECTED',
    'VERIFYING',
    'PAID',
    'RECEIPT_ISSUED',
    'EXPIRED',
    'CANCELLED'
  )),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number)
);

create table if not exists payment_requests (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references invoices(id) on delete cascade,
  public_id uuid not null default gen_random_uuid() unique,
  payment_reference text not null unique,
  recipient_address text not null,
  status text not null default 'AWAITING_PAYMENT' check (status in (
    'AWAITING_PAYMENT',
    'PAYMENT_DETECTED',
    'VERIFYING',
    'CONFIRMED',
    'EXPIRED',
    'CANCELLED'
  )),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_organization_created_idx on invoices(organization_id, created_at desc);
create index if not exists invoices_status_idx on invoices(status);
create index if not exists payment_requests_status_idx on payment_requests(status);

