-- Multiple monitored commutes per user, each with per-direction time windows and
-- a set of monitored weekdays (ISO: 1=Mon … 7=Sun). Replaces the single flat
-- profiles.commuter_* commute for digest selection. (CLAUDE.md §16)
--
-- NOTE (§11): applied via MCP apply_migration on 2026-06-15. This file documents
-- the live state; it is not replayed by the CLI.
create table public.commute_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_stop_id text not null,
  to_stop_id text not null,
  outbound_start_time time,
  outbound_end_time time,
  return_start_time time,
  return_end_time time,
  -- ISO weekday numbers the route is monitored on; empty array = route paused.
  monitored_days smallint[] not null default '{1,2,3,4,5,6,7}',
  created_at timestamptz not null default now()
);

alter table public.commute_routes enable row level security;
-- Own-rows full CRUD: the frontend reads, and saves via delete-then-insert.
create policy "select own commute routes" on public.commute_routes
  for select to authenticated using (auth.uid() = user_id);
create policy "insert own commute routes" on public.commute_routes
  for insert to authenticated with check (auth.uid() = user_id);
create policy "update own commute routes" on public.commute_routes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own commute routes" on public.commute_routes
  for delete to authenticated using (auth.uid() = user_id);

create index idx_commute_routes_user on public.commute_routes (user_id);

-- Backfill: migrate the existing single commute (flat profiles.commuter_* columns)
-- into a route row so the digest keeps working for current opted-in users.
insert into public.commute_routes
  (user_id, from_stop_id, to_stop_id,
   outbound_start_time, outbound_end_time, return_start_time, return_end_time)
select id, commuter_from_stop_id, commuter_to_stop_id,
       commuter_outbound_start_time, commuter_outbound_end_time,
       commuter_return_start_time, commuter_return_end_time
from public.profiles
where commuter_from_stop_id is not null
  and commuter_to_stop_id is not null;
