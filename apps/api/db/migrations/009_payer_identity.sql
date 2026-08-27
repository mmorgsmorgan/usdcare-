alter table account_profiles add column if not exists display_name text;
alter table account_profiles add column if not exists email text;

create index if not exists account_profiles_display_name_idx on account_profiles(lower(display_name));
create index if not exists account_profiles_email_idx on account_profiles(lower(email));
