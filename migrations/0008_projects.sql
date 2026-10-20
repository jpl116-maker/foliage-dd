create table if not exists projects (
  id text primary key,
  slug text not null unique,
  name text not null,
  client_name text not null default '',
  portfolio text not null default '',
  due_on text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists project_members (
  project_id text not null references projects (id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('admin', 'reviewer', 'client')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx on project_members (user_id);

alter table data_room_folders
  add column if not exists project_id text not null default 'default';

create index if not exists data_room_folders_project_idx
  on data_room_folders (project_id);
