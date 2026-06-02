{{ config(
    materialized='table'
) }}

with departures as (
    select *
    from {{ ref('fct_departures') }}
    where event_type = 'departure'
),

arrivals as (
    select *
    from {{ ref('fct_departures') }}
    where event_type = 'arrival'
    and (coalesce(arrival_delay, 0) >= 1200 or coalesce(canceled, false))
)

select
    -- surrogate key for this journey (Kimball: one column identifier per fact row)
    {{ dbt_utils.generate_surrogate_key([
        'origin.trip__trip_id',
        'origin.trip__start_date',
        'origin.stop__id',
        'dest.stop__id'
    ]) }} as journey_key,

    -- natural grain (the business keys that define uniqueness)
    origin.trip__trip_id,
    origin.trip__start_date,
    origin.stop__id           as origin_stop_id,
    dest.stop__id             as destination_stop_id,

    -- descriptive attributes
    origin.stop__name         as origin_stop_name,
    dest.stop__name           as destination_stop_name,
    origin.stop_sequence      as origin_sequence,
    dest.stop_sequence        as destination_sequence,

    -- timing facts
    origin.scheduled          as origin_scheduled,
    origin.realtime           as origin_actual,
    dest.scheduled            as destination_scheduled,
    dest.realtime             as destination_actual,

    -- calendar day the origin departure physically runs, in Stockholm local time.
    -- distinct from trip__start_date (GTFS service date) for post-midnight trips.
    (origin.scheduled at time zone 'Europe/Stockholm')::date as origin_local_date,

    -- delay measures (v1: train delay at destination only)
    dest.arrival_delay                     as destination_delay_seconds,
    round(dest.arrival_delay / 60.0, 1)    as destination_delay_minutes,

    -- v1 claim rule: 20+ min late OR cancelled
    (coalesce(dest.arrival_delay, 0) >= 1200)
        or coalesce(dest.canceled, false)  as is_claimable,

    dest.canceled,

    -- route / operator context
    origin.route__name,
    origin.route__destination__name        as line_terminus,
    origin.agency__operator

from departures as origin
join arrivals as dest
    on  origin.trip__trip_id    = dest.trip__trip_id
    and origin.trip__start_date = dest.trip__start_date
    and origin.stop_sequence    < dest.stop_sequence
