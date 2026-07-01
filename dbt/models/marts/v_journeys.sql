{{ config(
    materialized='view',
    schema='public',
    post_hook="grant select on {{ this }} to anon, authenticated"
) }}

select
    journey_key,
    service_number,
    transport_mode,
    origin_local_date,
    origin_stop_id,
    destination_stop_id,
    origin_stop_name,
    destination_stop_name,
    origin_scheduled,
    origin_actual,
    destination_scheduled,
    destination_actual,
    destination_delay_minutes,
    route_distance_km,
    is_claimable,
    canceled,
    line_name,
    line_terminus,
    operator,
    train_owner,
    origin_source,
    destination_source
from {{ ref('fct_journeys') }}
