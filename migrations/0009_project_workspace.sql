alter table projects
  add column if not exists workspace text not null default 'entity';
