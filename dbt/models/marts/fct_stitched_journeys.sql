{{ config(materialized='view') }}

-- fct_stitched_journeys
-- Cross-border (and, as TV widens, any cross-feed) train journeys, built by pairing
-- the disjoint stop-events in int_stop_events: a DEPARTURE at the origin joined to a
-- later ARRIVAL of the same train. Origin legs come from whichever feed owns that stop
-- (TV = Swedish, REST = Danish); destination likewise. The MVP corridor yields
-- Malmö C dep (TV) -> København H arr (REST) and the reverse.
--
-- Grain: one row per (train_number, service_date, origin_stop_id, destination_stop_id).
--
-- Pairing key is (train_number) within a bounded time window, NOT service_date equality:
--  * train numbers recycle daily, so the < 12h window keeps each physical run separate
--    from the next day's run (~24h later);
--  * a window (not same service_date) is required so a 23:5x departure still pairs with
--    its 00:xx next-day arrival (§6 cross-midnight). Journey date = the ORIGIN's local date.
-- No stop_sequence (TV has none): origin precedes destination by scheduled time.

with departures as (
    select * from {{ ref('int_stop_events') }} where event_type = 'departure'
),

arrivals as (
    select * from {{ ref('int_stop_events') }} where event_type = 'arrival'
)

select
    {{ dbt_utils.generate_surrogate_key([
        'origin.train_number',
        'origin.service_date',
        'origin.station_id',
        'dest.station_id'
    ]) }} as journey_key,

    -- natural grain
    origin.train_number,
    origin.service_date,
    origin.station_id              as origin_stop_id,
    dest.station_id                as destination_stop_id,

    -- which feed supplied each leg (audit: TV Swedish vs REST Danish)
    origin.source                  as origin_source,
    dest.source                    as destination_source,

    -- timing
    origin.scheduled               as origin_scheduled,
    origin.realtime                as origin_actual,
    dest.scheduled                 as destination_scheduled,
    dest.realtime                  as destination_actual,

    -- delay measures (v1: train delay at destination only)
    dest.delay_seconds                      as destination_delay_seconds,
    round(dest.delay_seconds / 60.0, 1)     as destination_delay_minutes,

    -- v1 claim rule: 20+ min late at destination OR cancelled
    (coalesce(dest.delay_seconds, 0) >= 1200)
        or coalesce(dest.canceled, false)   as is_claimable,

    dest.canceled

from departures as origin
join arrivals as dest
    on  origin.train_number = dest.train_number
    and dest.scheduled >  origin.scheduled
    and dest.scheduled <= origin.scheduled + interval '12 hours'   -- one physical run; excludes next-day recurrence
    and origin.station_id <> dest.station_id                       -- O-D legs only; drop self-loops from trains that revisit a stop
