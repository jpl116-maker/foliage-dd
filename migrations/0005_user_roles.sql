create table if not exists folia_roles (
  user_id text primary key,
  role text not null check (role in ('admin', 'reviewer', 'client')),
  updated_at timestamptz not null default now()
);
