{{ config(materialized='view') }}

-- int_stop_events  (DRAFT — not yet wired into fct_departures)
-- The conforming layer: merges the two realtime feeds into one stop-event set.
--   * stg_departures            (REST)  — all modes, only cross-border source, but hollow for some Swedish rail
--   * stg_train_announcements   (TV)    — all Swedish rail, genuine track-measured delay, dies at the border
--
-- Grain: one row per conformed stop-event (train_number, station_id, event_type, service_date).
-- Verified: a train hits a station once per run with one arrival + one departure (train 1061 @ Malmö C).
--
-- Conformed station key = REST's native short stop__id (e.g. 3, 1586, 1587), NOT the 740... form.
-- REST strips the 740 prefix and Danish stops reuse the short namespace (København H = 25315),
-- so reconstructing 740 would fabricate/collide. TV maps INTO the short id via the verified identity
-- right(ref_stations.rest_area_id, 6)::int = stop__id, gated to 740-prefixed (Swedish) ids only.
--
-- Precedence: TV outranks REST. No geographic branching needed — coverage gaps make it fall out:
--   Swedish stop, both present -> TV wins (genuine track data, trustworthy canceled flag)
--   Danish stop -> TV absent   -> REST wins by default
--   tram/boat (future)         -> no TV row -> REST wins
-- A single window does double duty: cross-source precedence (source_priority) AND the §5
-- intra-source latest-poll dedup (ingested_at desc). The surviving row carries the winner's
-- ingested_at, which is the freshest signal an incremental fct should watermark on.

with rest as (

    select
        stop__id::int                                       as station_id
        ,trip__technical_number::text                       as train_number     -- REST stores this as integer; conform to text
        ,event_type
        ,(scheduled at time zone 'Europe/Stockholm')::date  as service_date     -- physical local date of the event (§6)
        ,scheduled
        ,realtime
        ,arrival_delay                                      as delay_seconds    -- signed per-event deviation (the §13 misnomer fixed)
        ,canceled
        ,ingested_at
        ,'rest'                                             as source
        ,2                                                  as source_priority
    from {{ ref('stg_departures') }}

),

tv as (

    select
        right(r.rest_area_id, 6)::int                       as station_id       -- = REST short stop__id for Swedish stops
        ,t.advertised_train_ident                           as train_number     -- already text
        ,t.event_type
        ,(t.scheduled at time zone 'Europe/Stockholm')::date as service_date
        ,t.scheduled
        ,t.realtime
        ,t.delay_seconds
        ,t.canceled
        ,t.ingested_at
        ,'tv'                                               as source
        ,1                                                  as source_priority
    from {{ ref('stg_train_announcements') }} t
    join {{ source('reference', 'ref_stations') }} r
        on  r.tv_signature = t.location_signature
        and r.rest_area_id ~ '^740[0-9]{6}$'                -- the crosswalk staging couldn't do; Swedish stops only
    where t.event_type is not null                          -- guard: any unmapped ActivityType drops out rather than poisoning the key

),

ranked as (

    select
        *
        ,row_number() over (
            partition by train_number, station_id, event_type, service_date
            order by source_priority asc, ingested_at desc  -- TV wins; then newest poll
        ) as rn
    from (
        select * from rest
        union all
        select * from tv
    ) u

)

select
    {{ dbt_utils.generate_surrogate_key(['train_number', 'station_id', 'event_type', 'service_date']) }} as stop_event_key
    ,train_number
    ,station_id
    ,event_type
    ,service_date
    ,scheduled
    ,realtime
    ,delay_seconds
    ,canceled
    ,source                                                 -- degenerate dim: which feed won this event
    ,ingested_at                                            -- winner's; the watermark signal for a downstream incremental fct
from ranked
where rn = 1
