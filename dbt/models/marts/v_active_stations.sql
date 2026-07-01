{{ config(
    materialized='view',
    schema='public',
    post_hook="grant select on {{ this }} to anon, authenticated"
) }}

select
    dim_station_id,
    stop__id,
    station_name,
    stop__lat,
    stop__lon
from {{ ref('dim_active_stations') }}