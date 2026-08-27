alter table treatment_escrows
  add column if not exists open_funding boolean not null default true;
