{{ config(
    materialized='view',
    schema='public',
    post_hook=[
        "alter view {{ this }} set (security_invoker = on)",
        "grant select on {{ this }} to anon, authenticated"
    ]
) }}

select
    dim_station_id,
    stop__id,
    station_name,
    stop__lat,
    stop__lon
from {{ ref('dim_active_stations') }}