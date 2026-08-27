create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  title text not null,
  message text not null,
  link_url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  check (user_id is not null or organization_id is not null)
);

create index if not exists idx_notifications_user on notifications(user_id) where user_id is not null;
create index if not exists idx_notifications_org on notifications(organization_id) where organization_id is not null;
