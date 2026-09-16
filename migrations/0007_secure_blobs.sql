alter table data_room_files
  add column if not exists storage_key text;

alter table data_room_files
  add column if not exists ready boolean not null default true;

create table if not exists data_room_blobs (
  storage_key text not null,
  chunk_index integer not null,
  payload bytea not null,
  primary key (storage_key, chunk_index)
);
