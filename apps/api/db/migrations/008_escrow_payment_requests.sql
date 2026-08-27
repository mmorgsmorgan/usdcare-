alter table treatment_escrows
  add column if not exists public_id uuid not null default gen_random_uuid(),
  add column if not exists payment_reference text,
  add column if not exists payer_transaction_hash text;

create unique index if not exists treatment_escrows_public_id_idx on treatment_escrows(public_id);
create unique index if not exists treatment_escrows_payment_reference_idx on treatment_escrows(payment_reference) where payment_reference is not null;
