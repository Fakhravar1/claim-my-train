create or replace function public.get_api_usage_daily(
  since_ts timestamptz,
  timezone_name text default 'Europe/Stockholm'
)
returns table(day date, calls integer)
language sql
security definer
set search_path = public
as $$
  select
    (fetched_at at time zone timezone_name)::date as day,
    count(distinct fetched_at)::int as calls
  from public.departures
  where fetched_at >= since_ts
  group by 1
  order by 1;
$$;

grant execute on function public.get_api_usage_daily(timestamptz, text) to anon, authenticated;

