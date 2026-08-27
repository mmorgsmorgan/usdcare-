alter table payment_requests add column if not exists transaction_hash text;
alter table payment_requests add column if not exists confirmed_at timestamptz;
