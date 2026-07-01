-- Data-freshness watchdog (added 2026-07-01, after the silent 5 h TV outage).
-- Documentation copy — applied live via MCP apply_migration (§11 Option A).
--
-- Why: pg_cron reports "succeeded" on dispatch, NOT on the function's response,
-- so a failing collector stays green. This watches the REAL symptom — did fresh
-- rows land? — per source, and emails on breach/recovery via Resend.
--
-- Companion objects (not DDL, so not here): edge function `check-data-freshness`
-- (verify_jwt=false, deploy + repo copy at supabase/functions/check-data-freshness/)
-- and pg_cron job `check-data-freshness-30m` (jobid 15, '*/30 * * * *').

create or replace function public.check_data_freshness()
returns table(
  check_name text,
  last_ingested timestamptz,
  age_minutes numeric,
  threshold_minutes int,
  breaching boolean
)
language sql
security definer
set search_path = public, dbt_dev
as $$
  with checks as (
    select 'tv_raw'::text as n, max(ingested_at) as li, 90 as thr
    from public.raw_train_announcements
    union all
    select 'rest_raw', max(ingested_at), 90 from public.raw_departures
    union all
    select 'int_stop_events', max(ingested_at), 360 from dbt_dev.int_stop_events
  )
  select
    n, li,
    round(extract(epoch from (now() - li)) / 60, 1),
    thr,
    (li is null or li < now() - make_interval(mins => thr))
  from checks;
$$;

revoke all on function public.check_data_freshness() from anon, authenticated;

create table if not exists public.data_freshness_alert_state (
  check_name text primary key,
  breaching boolean not null default false,
  last_notified_at timestamptz
);
alter table public.data_freshness_alert_state enable row level security;
-- Service-role only (the watchdog); no anon/authenticated policies.
