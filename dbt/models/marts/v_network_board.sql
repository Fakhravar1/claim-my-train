{{ config(
    materialized='view',
    schema='public',
    post_hook="grant select on {{ this }} to anon, authenticated"
) }}

-- Public wrapper over the precomputed board sample (agg_network_board). Column-compatible
-- with v_journeys (same names/order) plus `tier`, so the frontend Journey type is reused;
-- the board reads this by origin_local_date and shuffles the per-tier pool client-side.

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
    destination_source,
    tier
from {{ ref('agg_network_board') }}
