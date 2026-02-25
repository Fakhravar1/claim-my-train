alter table public.profiles
  add column if not exists commuter_from_stop_id text,
  add column if not exists commuter_to_stop_id text,
  add column if not exists commuter_outbound_start_time time,
  add column if not exists commuter_outbound_end_time time,
  add column if not exists commuter_return_start_time time,
  add column if not exists commuter_return_end_time time;

