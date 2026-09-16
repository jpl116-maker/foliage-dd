alter table data_room_files
  add column if not exists reviewed_by text;
