alter table data_room_files
  add column if not exists assigned_user_id text;

alter table data_room_folders
  add column if not exists assigned_user_id text;
