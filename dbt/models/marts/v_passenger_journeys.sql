{{ config(
    materialized='view',
    schema='public',
    post_hook="grant select on {{ this }} to anon, authenticated"
) }}

select
    journey_key,
    trip__trip_id,
    trip__start_date,
    origin_stop_id,
    destination_stop_id,
    origin_stop_name,
    destination_stop_name,
    origin_scheduled,
    origin_actual,
    destination_scheduled,
    destination_actual,
    origin_local_date,
    destination_delay_minutes,
    is_claimable,
    canceled,
    route__name,
    line_terminus,
    agency__operator
from {{ ref('fct_passenger_journeys') }}