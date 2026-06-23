{{ config(materialized='view') }}

-- dim_station_coords
-- Unified (stop__id -> lat/lon) lookup across both feeds, so any model can resolve a
-- station's coordinates by the conformed short stop id used in int_stop_events.
--   * Danish stops: coords from dim_stations (REST-polled boards).
--   * Swedish stops: coords from ref_stations (the Trafikverket crosswalk) — dim_stations
--     only knows REST-polled stops, so every TV-only Swedish station (most of the network)
--     would otherwise have NULL coords.
-- One row per stop__id. Consumed by fct_journeys (route_distance_km) and dim_active_stations.
-- NOTE: several tv_signatures can share one rest_area_id (e.g. Ramlosa Ram + Hbgb -> 740001270),
-- so the TV side is aggregated to one row per short id before the union (else the grain breaks).

with rest_coords as (

    select
        stop__id::text  as station_id,
        stop__lat       as lat,
        stop__lon       as lon
    from {{ ref('dim_stations') }}
    where stop__lat is not null and stop__lon is not null

),

tv_coords as (

    select
        right(rest_area_id, 6)::int::text as station_id,   -- '740000003' -> 3 -> '3', the conformed short id
        max(lat)                          as lat,
        max(lon)                          as lon
    from {{ source('reference', 'ref_stations') }}
    where rest_area_id ~ '^740[0-9]{6}$'                   -- Swedish stops only
      and lat is not null and lon is not null
    group by 1

),

unioned as (

    select station_id, lat, lon from rest_coords
    union all
    select station_id, lat, lon from tv_coords

)

-- A station present in both feeds (rare; corridor seams) collapses to one row.
select
    station_id as stop__id,
    max(lat)   as lat,
    max(lon)   as lon
from unioned
group by station_id
