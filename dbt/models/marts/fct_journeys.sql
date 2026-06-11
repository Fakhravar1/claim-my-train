{{ config(materialized='view') }}

-- fct_journeys
-- THE journey fact the frontend reads (via public.v_journeys). Built by pairing the
-- disjoint stop-events in int_stop_events: an origin DEPARTURE joined to a later
-- ARRIVAL of the same service. Each leg comes from whichever feed owns that stop
-- (TV = Swedish, REST = Danish) — origin_source / destination_source say which.
--
-- Trains only for now; future modes (tram, boat) flow in through int_stop_events
-- and surface here via transport_mode — the column contract is mode-agnostic
-- (service_number, not train_number; line_name, not route__name).
--
-- Grain: one row per (service_number, origin_local_date, origin_stop_id, destination_stop_id).
--
-- Pairing key is (service_number) within a bounded time window, NOT service_date equality:
--  * service numbers recycle daily, so the < 12h window keeps each physical run separate
--    from the next day's run (~24h later);
--  * a window (not same-date) is required so a 23:5x departure still pairs with its
--    00:xx next-day arrival (§6 cross-midnight). Journey date = the ORIGIN's local date.
-- No stop_sequence (TV has none): origin precedes destination by scheduled time.

with departures as (
    select * from {{ ref('int_stop_events') }} where event_type = 'departure'
),

arrivals as (
    select * from {{ ref('int_stop_events') }} where event_type = 'arrival'
)

select
    {{ dbt_utils.generate_surrogate_key([
        'origin.service_number',
        'origin.service_date',
        'origin.station_id',
        'dest.station_id'
    ]) }} as journey_key,

    -- natural grain (unified, mode-agnostic vocabulary)
    origin.service_number,
    origin.service_date            as origin_local_date,    -- the calendar day the origin departure physically runs (frontend date filter)
    origin.station_id::text        as origin_stop_id,       -- text: matches v_active_stations.stop__id and the frontend's string .eq()
    dest.station_id::text          as destination_stop_id,

    origin.transport_mode,                                  -- 'train' for now

    -- descriptive attributes
    origin.station_name            as origin_stop_name,
    dest.station_name              as destination_stop_name,
    origin.line_name,                                       -- nullable: TV legs have no line concept (UI falls back to service_number)
    origin.line_terminus,
    origin.operator,

    -- which feed supplied each leg (TV Swedish vs REST Danish) — source audit
    origin.source                  as origin_source,
    dest.source                    as destination_source,

    -- timing
    origin.scheduled               as origin_scheduled,
    origin.realtime                as origin_actual,
    dest.scheduled                 as destination_scheduled,
    dest.realtime                  as destination_actual,

    -- delay measures (v1: delay at destination only)
    dest.delay_seconds                      as destination_delay_seconds,
    round(dest.delay_seconds / 60.0, 1)     as destination_delay_minutes,

    -- v1 claim rule: 20+ min late at destination OR cancelled
    (coalesce(dest.delay_seconds, 0) >= 1200)
        or coalesce(dest.canceled, false)   as is_claimable,

    dest.canceled

from departures as origin
join arrivals as dest
    on  origin.service_number = dest.service_number
    and dest.scheduled >  origin.scheduled
    and dest.scheduled <= origin.scheduled + interval '12 hours'   -- one physical run; excludes next-day recurrence
    and origin.station_id <> dest.station_id                       -- O-D legs only; drop self-loops from services that revisit a stop
