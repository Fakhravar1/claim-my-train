alter table public.profiles
  add column if not exists claims_done_count integer not null default 0;

