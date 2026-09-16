alter table data_room_files
  add column if not exists reviewed boolean not null default false;
