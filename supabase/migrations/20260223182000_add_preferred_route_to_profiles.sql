alter table public.profiles
  add column if not exists preferred_from_stop_id text,
  add column if not exists preferred_to_stop_id text;

