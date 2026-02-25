create table if not exists public.claimable_corridor_windows (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  direction text not null,
  trip_key text not null,
  line text not null,
  line_name text not null,
  origin_stop_id text not null,
  origin_stop_name text not null,
  destination_stop_id text not null,
  destination_stop_name text not null,
  departure_datetime timestamptz not null,
  scheduled_arrival_datetime timestamptz,
  actual_arrival_datetime timestamptz,
  arrival_delay_minutes integer not null default 0,
  claimable boolean not null default false,
  observed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '72 hours')
);

alter table public.claimable_corridor_windows enable row level security;

drop policy if exists "Allow read corridor windows" on public.claimable_corridor_windows;
create policy "Allow read corridor windows"
  on public.claimable_corridor_windows
  for select
  using (true);

create index if not exists idx_corridor_windows_pair_claimable_observed
  on public.claimable_corridor_windows (origin_stop_id, destination_stop_id, claimable, observed_at desc);

create index if not exists idx_corridor_windows_expires
  on public.claimable_corridor_windows (expires_at);

