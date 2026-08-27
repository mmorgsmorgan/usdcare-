create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  privy_user_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists account_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  account_type text not null check (account_type in ('individual', 'organization')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_type text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists memberships (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  privy_wallet_id text,
  address text not null,
  wallet_type text not null check (wallet_type in ('embedded', 'external', 'smart', 'organization')),
  chain_caip2 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain_caip2, address)
);

create table if not exists wallet_role_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  wallet_address text not null,
  chain_caip2 text not null,
  role text not null check (role in ('transaction', 'settlement')),
  assigned_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now()
);

create index if not exists memberships_user_id_idx on memberships(user_id);
create index if not exists wallets_user_id_idx on wallets(user_id);
create index if not exists wallet_roles_organization_idx on wallet_role_assignments(organization_id);
