alter table data_room_files
  add column if not exists flagged boolean not null default false;
