{{ config(
    materialized='incremental',
    unique_key='stop_event_key',
    incremental_strategy='delete+insert',
    on_schema_change='sync_all_columns',
    indexes=[
      {'columns': ['event_type', 'station_id', 'service_date']},
      {'columns': ['service_number', 'event_type', 'scheduled']}
    ],
    post_hook="analyze {{ this }}"
) }}

-- int_stop_events
-- Disjoint union of stop-events across the two feeds. No precedence/overlap
-- resolution: the feeds cover SEPARATE territory, so they don't compete.
--   * TV   (stg_train_announcements) — Swedish train stops, genuine track-measured delay
--   * REST (stg_departures)          — DANISH stops only (the cross-border leg);
--                                       REST is the Danish-side / future non-train-mode source
--
-- Grain: one row per (service_number, station_id, event_type, service_date).
--
-- MATERIALIZATION: incremental TABLE (the linear substrate, analog of fct_departures
-- in the legacy chain). This is the §13 pattern at the ~1000-station target: persist
-- the stop-event grain (linear in events), keep the journey fan-out (fct_journeys,
-- quadratic in stops-per-trip) a lazily-read VIEW on top. Consequence: journey
-- freshness is gated on `dbt build` again (GH Actions, 1–4 h jitter) — deliberate
-- trade for not recomputing the dedup over all raw on every page load.
--
-- INCREMENTAL UNIT = the stop-event key (row-level watermark is SAFE here, unlike
-- fct_departures): the only window function is the dedup, whose partition is exactly
-- the unique key — nothing spans beyond one key, so a partial batch can't corrupt
-- anything (§13 rule: incremental grain >= coarsest key any window spans).
-- 6 h lookback margin = realtime settling tail (~2 h) + GH-Actions build gap (~4 h).
-- TV raw rows are upserted IN PLACE (ingested_at refreshes on re-pull), so revised
-- TV events re-enter the batch; REST appends new poll rows per revision.
--
-- station_id is REST's native short stop__id (3, 1586, 1587 / DK 25315). TV maps in via
-- right(ref_stations.rest_area_id,6)::int = stop__id, gated to 740-prefixed (Swedish) ids.
--
-- Unified vocabulary: service_number (mode-agnostic; the train number for rail),
-- transport_mode ('train' for now — future trams/boats extend the REST CTE's filter),
-- line_name / line_terminus / operator are descriptive-only and nullable (TV has no
-- line concept; never use them as join or rule keys, §5/§8).

with tv as (   -- Swedish stop-events

    select
        -- ::int strips the zero-padding ('740000003' -> '000003' -> 3), ::text because
        -- the conformed station id is TEXT end-to-end (matches REST's native stop__id and
        -- keeps the (event_type, station_id, service_date) index sargable from v_journeys)
        right(r.rest_area_id, 6)::int::text                 as station_id
        ,coalesce(r.rest_name, r.station_name)              as station_name
        ,t.advertised_train_ident                           as service_number
        ,'train'                                            as transport_mode
        ,t.event_type
        ,(t.scheduled at time zone 'Europe/Stockholm')::date as service_date
        ,t.scheduled
        ,t.realtime
        ,t.delay_seconds
        ,t.canceled
        ,null::text                                         as line_name        -- TV has no line concept
        ,null::text                                         as line_terminus
        -- information_owner is TV's BRAND label (Öresundståg / Skånetrafiken / SJ /
        -- Snälltåget) — what users recognize. TV's `operator` field is the corporate
        -- contractor (ARRIVA, SNÄLL); deliberately not used for display.
        ,t.information_owner                                as operator
        ,t.ingested_at
        ,'tv'                                               as source
    from {{ ref('stg_train_announcements') }} t
    join {{ source('reference', 'ref_stations') }} r
        on  r.tv_signature = t.location_signature
        and r.rest_area_id ~ '^740[0-9]{6}$'                -- Swedish stops only
    where t.event_type is not null
      -- MONITORING-ONLY exclusion fence: the TV collector may poll hubs purely for
      -- corridor scouting (agg_corridor_delays); list their signatures here so they
      -- never leak into fct_journeys / dim_active_stations / the dropdowns. Adding a
      -- signature here hides it from the claim UI; removing it launches that station
      -- as a claim corridor. CURRENTLY EMPTY — Stockholm C (Cst) was reclassified to a
      -- claimable SJ corridor on 2026-06-23 (trunk launch). To re-add: AND the filter
      --   and t.location_signature not in ('Sig1', 'Sig2')
    {% if is_incremental() %}
      and t.ingested_at >= (select max(ingested_at) from {{ this }}) - interval '6 hours'
    {% endif %}

),

rest as (      -- Danish stop-events ONLY — REST is the Danish leg for trains

    select
        stop__id                                            as station_id   -- already the native short text id ('3', '25315')
        ,stop__name                                         as station_name
        ,trip__technical_number::text                       as service_number
        ,lower(route__transport_mode)                       as transport_mode
        ,event_type
        ,(scheduled at time zone 'Europe/Stockholm')::date  as service_date
        ,scheduled
        ,realtime
        ,arrival_delay                                      as delay_seconds
        ,canceled
        ,route__name                                        as line_name
        ,route__destination__name                           as line_terminus
        ,agency__operator                                   as operator
        ,ingested_at
        ,'rest'                                             as source
    from {{ ref('stg_departures') }}
    where stop__id in (
          '25314'   -- CPH Airport (Kastrup)
        , '23657'   -- Tårnby
        , '25313'   -- Ørestad
        , '25315'   -- København H
        , '25318'   -- København Nørreport
        , '25317'   -- København Østerport (corridor terminus)
      )                                                     -- Danish corridor stops (REST = Danish leg; collector polls their boards)
      and is_realtime = true
      and route__transport_mode = 'TRAIN'
    {% if is_incremental() %}
      and ingested_at >= (select max(ingested_at) from {{ this }}) - interval '6 hours'
    {% endif %}

),

-- intra-source latest-poll dedup (REST polls an event many times; §5 late-arriving fact).
-- No cross-source contention: territories are disjoint, so each key has one source.
-- Under incremental, the window runs over the batch only — safe, because delete+insert
-- replaces the stored row and any row in the batch is newer than what it replaces.
deduped as (

    select
        *
        ,row_number() over (
            partition by service_number, station_id, event_type, service_date
            order by ingested_at desc
        ) as rn
    from (
        select * from tv
        union all
        select * from rest
    ) u

)

select
    {{ dbt_utils.generate_surrogate_key(['service_number', 'station_id', 'event_type', 'service_date']) }} as stop_event_key
    ,service_number
    ,station_id
    ,station_name
    ,transport_mode
    ,event_type
    ,service_date
    ,scheduled
    ,realtime
    ,delay_seconds
    ,canceled
    ,line_name
    ,line_terminus
    ,operator
    ,source                                                 -- 'tv' (Swedish) | 'rest' (Danish) — degenerate dim
    ,ingested_at
from deduped
where rn = 1
