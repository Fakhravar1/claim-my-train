create or replace function public.get_admin_api_analytics(
  since_ts timestamptz,
  timezone_name text default 'Europe/Stockholm'
)
returns jsonb
language sql
security definer
set search_path = public
as $$
with calls as (
  select distinct d.fetched_at
  from public.departures d
  where d.fetched_at >= since_ts
),
calls_with_rows as (
  select
    d.fetched_at,
    count(*)::int as rows_count,
    count(*) filter (where d.is_delayed)::int as delayed_rows_count
  from public.departures d
  where d.fetched_at >= since_ts
  group by d.fetched_at
),
call_gaps as (
  select
    c.fetched_at,
    extract(epoch from (c.fetched_at - lag(c.fetched_at) over (order by c.fetched_at))) / 60.0 as gap_minutes
  from calls c
),
dep_summary as (
  select
    count(*)::int as total_departure_rows,
    count(*) filter (where d.is_delayed)::int as delayed_departure_rows
  from public.departures d
  where d.fetched_at >= since_ts
),
claimable as (
  select *
  from public.yellow_alert_history y
  where y.actual_arrival_datetime >= since_ts
    and y.arrival_delay_minutes >= 20
),
claimable_by_hour as (
  select
    extract(hour from (c.departure_datetime at time zone timezone_name))::int as hour_of_day,
    count(*)::int as opportunities
  from claimable c
  group by 1
),
claimable_by_weekday as (
  select
    extract(isodow from (c.departure_datetime at time zone timezone_name))::int as iso_weekday,
    count(*)::int as opportunities
  from claimable c
  group by 1
),
daily_calls as (
  select
    (c.fetched_at at time zone timezone_name)::date as day,
    count(*)::int as calls
  from calls c
  group by 1
),
severity as (
  select
    case
      when c.arrival_delay_minutes >= 60 then '60+ min'
      when c.arrival_delay_minutes >= 40 then '40-59 min'
      when c.arrival_delay_minutes >= 30 then '30-39 min'
      else '20-29 min'
    end as bucket,
    count(*)::int as opportunities
  from claimable c
  group by 1
),
unique_impacted as (
  select
    count(distinct c.line)::int as unique_trains,
    count(distinct c.departure_station)::int + count(distinct c.arrival_station)::int as station_touches,
    (
      select count(*)::int
      from (
        select distinct s.station
        from (
          select c2.departure_station as station from claimable c2
          union all
          select c3.arrival_station as station from claimable c3
        ) s
      ) stations
    ) as unique_stations
  from claimable c
),
freshness as (
  select
    max(c.fetched_at) as latest_fetch,
    extract(epoch from (now() - max(c.fetched_at))) / 60.0 as minutes_since_last_fetch,
    avg(g.gap_minutes) as avg_gap_minutes,
    max(g.gap_minutes) as max_gap_minutes
  from calls c
  left join call_gaps g on g.fetched_at = c.fetched_at
),
quality as (
  select
    (select count(*)::int from calls) as calls_count,
    (select coalesce(sum(cwr.rows_count), 0)::int from calls_with_rows cwr) as total_rows,
    (select coalesce(sum(cwr.delayed_rows_count), 0)::int from calls_with_rows cwr) as delayed_rows,
    (select coalesce(avg(cwr.rows_count), 0)::numeric from calls_with_rows cwr) as avg_rows_per_call,
    (select coalesce(percentile_cont(0.95) within group (order by cwr.rows_count), 0)::numeric from calls_with_rows cwr) as p95_rows_per_call
),
funnel as (
  select jsonb_build_array(
    jsonb_build_object('stage', 'API calls', 'value', q.calls_count),
    jsonb_build_object('stage', 'Departures captured', 'value', q.total_rows),
    jsonb_build_object('stage', 'Delayed departures', 'value', q.delayed_rows),
    jsonb_build_object('stage', 'Claim opportunities (>=20 min)', 'value', (select count(*)::int from claimable))
  ) as stages
  from quality q
)
select jsonb_build_object(
  'daily_calls', coalesce((
    select jsonb_agg(
      jsonb_build_object('day', d.day::text, 'calls', d.calls)
      order by d.day
    )
    from daily_calls d
  ), '[]'::jsonb),
  'funnel', (select stages from funnel),
  'unique_impacted', (
    select jsonb_build_object(
      'unique_trains', coalesce(u.unique_trains, 0),
      'unique_stations', coalesce(u.unique_stations, 0),
      'station_touches', coalesce(u.station_touches, 0)
    )
    from unique_impacted u
  ),
  'by_hour', coalesce((
    select jsonb_agg(
      jsonb_build_object('hour', h.hour_of_day, 'opportunities', h.opportunities)
      order by h.hour_of_day
    )
    from claimable_by_hour h
  ), '[]'::jsonb),
  'by_weekday', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'weekday',
        case w.iso_weekday
          when 1 then 'Mon'
          when 2 then 'Tue'
          when 3 then 'Wed'
          when 4 then 'Thu'
          when 5 then 'Fri'
          when 6 then 'Sat'
          when 7 then 'Sun'
        end,
        'opportunities', w.opportunities
      )
      order by w.iso_weekday
    )
    from claimable_by_weekday w
  ), '[]'::jsonb),
  'severity', coalesce((
    select jsonb_agg(
      jsonb_build_object('bucket', s.bucket, 'opportunities', s.opportunities)
      order by
        case s.bucket
          when '20-29 min' then 1
          when '30-39 min' then 2
          when '40-59 min' then 3
          when '60+ min' then 4
          else 99
        end
    )
    from severity s
  ), '[]'::jsonb),
  'quality', (
    select jsonb_build_object(
      'calls_count', q.calls_count,
      'total_rows', q.total_rows,
      'delayed_rows', q.delayed_rows,
      'avg_rows_per_call', q.avg_rows_per_call,
      'p95_rows_per_call', q.p95_rows_per_call,
      'claimable_per_100_calls',
      case
        when q.calls_count > 0
          then ((select count(*)::numeric from claimable) * 100.0 / q.calls_count)
        else 0
      end
    )
    from quality q
  ),
  'freshness', (
    select jsonb_build_object(
      'latest_fetch', f.latest_fetch,
      'minutes_since_last_fetch', coalesce(f.minutes_since_last_fetch, 0),
      'avg_gap_minutes', coalesce(f.avg_gap_minutes, 0),
      'max_gap_minutes', coalesce(f.max_gap_minutes, 0)
    )
    from freshness f
  )
);
$$;

grant execute on function public.get_admin_api_analytics(timestamptz, text) to anon, authenticated;

