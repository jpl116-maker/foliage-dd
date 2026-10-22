create table if not exists audit_events (
  id bigserial primary key,
  project_id text not null,
  user_id text not null,
  username text not null,
  kind text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_project_idx
  on audit_events (project_id, created_at desc);
