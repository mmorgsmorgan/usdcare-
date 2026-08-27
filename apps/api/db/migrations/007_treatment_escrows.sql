create table if not exists treatment_escrows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  created_by_user_id uuid not null references users(id) on delete restrict,
  patient_reference text not null,
  treatment_name text not null,
  provider_wallet text not null,
  payer_wallet text,
  patient_approver_wallet text,
  approval_policy text not null default 'provider_only' check (approval_policy in ('provider_only', 'provider_and_patient')),
  total_minor bigint not null check (total_minor > 0),
  released_minor bigint not null default 0 check (released_minor >= 0),
  chain_escrow_id text,
  create_tx_hash text,
  fund_tx_hash text,
  status text not null default 'DRAFT' check (status in ('DRAFT','CREATED','FUNDED','COMPLETED','CANCELLED')),
  chain_caip2 text not null default 'eip155:5042002',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists treatment_escrow_milestones (
  id uuid primary key default gen_random_uuid(),
  escrow_id uuid not null references treatment_escrows(id) on delete cascade,
  milestone_index integer not null check (milestone_index >= 0),
  label text not null,
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','RELEASED')),
  approve_tx_hash text,
  release_tx_hash text,
  created_at timestamptz not null default now(),
  unique (escrow_id, milestone_index)
);

create index if not exists treatment_escrows_org_idx on treatment_escrows(organization_id, created_at desc);
