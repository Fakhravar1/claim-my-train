-- Zero rows = PASS.
-- Guards the 2026-07-19 storage rework: fct_claimable_journeys is a view pairing
-- fct_claimable_stop_events (the durable linear generating set). This test asserts
-- CAPTURE COMPLETENESS — every event that generates a claimable leg in the current
-- int_stop_events (settled window: yesterday and back) must exist in the durable
-- table, or the incremental train-batch logic silently lost a filable claim.
--
-- Deliberately tested at EVENT grain against int, not by diffing the two journey
-- views: a view-vs-view diff re-runs two full pairings and times out in hourly CI,
-- while this is a linear anti-join on the unique key. Pairing-logic drift between
-- fct_journeys and the claimable view is a code concern (the SQL is a deliberate
-- mirror — see both model headers); the windowed grain test on the view exercises
-- the pairing itself.
--
-- The reverse direction (durable events with no current int counterpart) is
-- EXPECTED and not tested: int prunes at ~5 d and revisions retract (§13 plan B).

with authority as (

    select
        min(min_delay_seconds)          as min_delay_seconds,
        bool_or(includes_cancellations) as includes_cancellations
    from {{ ref('dim_compensation_rules') }}

),

claimable_arrivals as (

    select e.*
    from {{ ref('int_stop_events') }} e
    cross join authority auth
    where e.event_type = 'arrival'
      and e.service_date between current_date - 3 and current_date - 1
      and (
            coalesce(e.delay_seconds, 0) >= auth.min_delay_seconds
         or (auth.includes_cancellations and coalesce(e.canceled, false))
      )

),

generating_departures as (

    select d.*
    from {{ ref('int_stop_events') }} d
    where d.event_type = 'departure'
      and d.service_date between current_date - 3 and current_date - 1
      and exists (
        select 1
        from claimable_arrivals a
        where a.service_number = d.service_number
          and a.scheduled >  d.scheduled
          and a.scheduled <= d.scheduled + interval '12 hours'
          and a.station_id <> d.station_id
          and a.service_date >= d.service_date
          and a.service_date <= d.service_date + 1
      )

),

expected as (

    select stop_event_key, service_number, service_date, event_type from claimable_arrivals
    union all
    select stop_event_key, service_number, service_date, event_type from generating_departures

)

select e.stop_event_key, e.service_number, e.service_date, e.event_type
from expected e
left join {{ ref('fct_claimable_stop_events') }} t using (stop_event_key)
where t.stop_event_key is null
