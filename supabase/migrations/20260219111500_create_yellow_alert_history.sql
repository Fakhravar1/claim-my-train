create table if not exists public.yellow_alert_history (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  direction text not null,
  line text not null,
  line_name text not null,
  departure_station text not null,
  arrival_station text not null,
  departure_datetime timestamptz not null,
  scheduled_arrival_datetime timestamptz not null,
  actual_arrival_datetime timestamptz not null,
  arrival_delay_minutes integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_yellow_alert_history_actual_arrival
  on public.yellow_alert_history (actual_arrival_datetime desc);

create index if not exists idx_yellow_alert_history_direction
  on public.yellow_alert_history (direction);

alter table public.yellow_alert_history enable row level security;

drop policy if exists "Allow read yellow alerts" on public.yellow_alert_history;

create policy "Allow read yellow alerts"
  on public.yellow_alert_history
  for select
  using (true);

