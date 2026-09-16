create table if not exists data_room_folders (
  id text primary key,
  parent_id text references data_room_folders (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists data_room_files (
  id text primary key,
  folder_id text not null references data_room_folders (id) on delete cascade,
  name text not null,
  mime_type text not null,
  size_bytes integer not null,
  content_b64 text not null,
  created_at timestamptz not null default now()
);

create index if not exists data_room_folders_parent_idx on data_room_folders (parent_id);
create index if not exists data_room_files_folder_idx on data_room_files (folder_id);
