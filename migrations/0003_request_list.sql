create table if not exists dd_list_meta (
  workspace text primary key,
  updated_at timestamptz not null default now()
);

create table if not exists dd_categories (
  workspace text not null,
  id text not null,
  name text not null,
  blurb text not null default '',
  sort_order integer not null default 0,
  primary key (workspace, id)
);

create table if not exists dd_requests (
  workspace text not null,
  id text not null,
  category_id text not null,
  document_id text,
  name text not null,
  detail text not null default '',
  status text not null default 'open',
  comments_json text not null default '[]',
  linked_files_json text not null default '[]',
  sort_order integer not null default 0,
  primary key (workspace, id)
);
