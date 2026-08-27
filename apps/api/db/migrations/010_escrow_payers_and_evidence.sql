create table if not exists treatment_escrow_payers (
  escrow_id uuid not null references treatment_escrows(id) on delete cascade,
  wallet_address text not null,
  display_name text,
  created_at timestamptz not null default now(),
  primary key (escrow_id, wallet_address)
);

alter table treatment_escrow_milestones
  add column if not exists evidence_hash text,
  add column if not exists evidence_url text,
  add column if not exists evidence_submitted_at timestamptz,
  add column if not exists payer_approval_count integer not null default 0;

alter table treatment_escrows
  add column if not exists required_payer_approvals integer not null default 0,
  add column if not exists funded_minor bigint not null default 0;
