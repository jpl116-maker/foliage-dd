create table if not exists dd_issue_meta (
  workspace text primary key,
  updated_at timestamptz not null default now()
);

create table if not exists dd_issues (
  workspace text not null,
  id text not null,
  document_id text,
  category_id text not null,
  title text not null,
  summary text not null default '',
  severity text not null,
  status text not null,
  code_section text,
  raised_on text not null,
  raised_by text not null default '',
  room_file_id text,
  room_folder_id text,
  room_file_name text,
  sort_order integer not null default 0,
  primary key (workspace, id)
);

create index if not exists dd_issues_workspace_idx on dd_issues (workspace, sort_order);
