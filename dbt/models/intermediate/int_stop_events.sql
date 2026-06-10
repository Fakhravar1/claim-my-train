{{ config(materialized='view') }}

-- int_stop_events
-- Disjoint union of train stop-events across the two feeds. No precedence/overlap
-- resolution: the feeds cover SEPARATE territory, so they don't compete.
--   * TV   (stg_train_announcements) — Swedish stops, genuine track-measured delay
--   * REST (stg_departures)          — DANISH stops only (the cross-border leg);
--                                       REST is the Danish-side / non-Swedish-rail source
--
-- Grain: one row per (train_number, station_id, event_type, service_date).
-- Downstream pairs these into cross-border journeys by (train_number, service_date),
-- ordering origin/destination by scheduled time. Stitch key verified: a train keeps
-- the same number across the border (97.9% of København H arrivals match a Malmö C
-- departure within REST), and TV uses that same number on the Swedish side.
--
-- station_id is REST's native short stop__id (3, 1586, 1587 / DK 25315). TV maps in via
-- right(ref_stations.rest_area_id,6)::int = stop__id, gated to 740-prefixed (Swedish) ids.

with tv as (   -- Swedish stop-events

    select
        right(r.rest_area_id, 6)::int                       as station_id
        ,t.advertised_train_ident                           as train_number
        ,t.event_type
        ,(t.scheduled at time zone 'Europe/Stockholm')::date as service_date
        ,t.scheduled
        ,t.realtime
        ,t.delay_seconds
        ,t.canceled
        ,t.ingested_at
        ,'tv'                                               as source
    from {{ ref('stg_train_announcements') }} t
    join {{ source('reference', 'ref_stations') }} r
        on  r.tv_signature = t.location_signature
        and r.rest_area_id ~ '^740[0-9]{6}$'                -- Swedish stops only
    where t.event_type is not null

),

rest as (      -- Danish stop-events ONLY — REST is the Danish-side leg for trains

    select
        stop__id::int                                       as station_id
        ,trip__technical_number::text                       as train_number
        ,event_type
        ,(scheduled at time zone 'Europe/Stockholm')::date  as service_date
        ,scheduled
        ,realtime
        ,arrival_delay                                      as delay_seconds
        ,canceled
        ,ingested_at
        ,'rest'                                             as source
    from {{ ref('stg_departures') }}
    where stop__id in (
          '25314'   -- CPH Airport (Kastrup)
        , '23657'   -- Tårnby
        , '25313'   -- Ørestad
        , '25315'   -- København H
      )                                                     -- Danish corridor stops (REST = Danish leg). Østerport not yet present in REST data; add its id when it appears.
      and is_realtime = true
      and route__transport_mode = 'TRAIN'

),

-- intra-source latest-poll dedup (REST polls an event many times; §5 late-arriving fact).
-- No cross-source contention: territories are disjoint, so each key has one source.
deduped as (

    select
        *
        ,row_number() over (
            partition by train_number, station_id, event_type, service_date
            order by ingested_at desc
        ) as rn
    from (
        select * from tv
        union all
        select * from rest
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
    ,source                                                 -- 'tv' (Swedish) | 'rest' (Danish) — degenerate dim
    ,ingested_at
from deduped
where rn = 1
