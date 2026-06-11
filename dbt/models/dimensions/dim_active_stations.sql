{{ config(materialized='table') }}

-- Stations the frontend dropdowns offer = every station appearing in fct_journeys.
--
-- Names come from int_stop_events itself (each leg carries station_name from its
-- own feed), NOT from dim_stations: dim_stations only knows REST-polled stops, so
-- a TV-only station (first case: Lund C — TV signature Lu, never REST-polled)
-- would silently vanish from the dropdowns. Coordinates are enrichment-only via
-- left join (nullable for TV-only stations; no frontend component reads them).

with active as (

    select
        station_id,
        max(station_name) as station_name   -- deterministic pick if feeds ever disagree on a name
    from {{ ref('int_stop_events') }}
    group by station_id

)

select
    {{ dbt_utils.generate_surrogate_key(['a.station_id']) }} as dim_station_id,
    a.station_id                                             as stop__id,
    a.station_name,
    s.stop__lat,
    s.stop__lon
from active a
left join {{ ref('dim_stations') }} s
    on s.stop__id = a.station_id
