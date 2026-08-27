alter table treatment_escrow_milestones
  add column if not exists evidence_description text;

create table if not exists escrow_milestone_disputes (
  id uuid primary key default gen_random_uuid(),
  escrow_id uuid not null references treatment_escrows(id) on delete cascade,
  milestone_index integer not null,
  disputer_user_id uuid not null references users(id),
  disputer_wallet text not null,
  reason text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED', 'REJECTED')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_disputes_escrow on escrow_milestone_disputes(escrow_id, milestone_index);

-- Add EVIDENCE_SUBMITTED to milestone status constraint
alter table treatment_escrow_milestones drop constraint if exists treatment_escrow_milestones_status_check;
alter table treatment_escrow_milestones add constraint treatment_escrow_milestones_status_check
  check (status in ('PENDING', 'APPROVED', 'RELEASED', 'EVIDENCE_SUBMITTED'));
