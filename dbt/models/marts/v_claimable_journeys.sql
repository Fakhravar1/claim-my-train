{{ config(
    materialized='view',
    schema='public',
    post_hook="grant select on {{ this }} to anon, authenticated"
) }}

-- Public wrapper over the durable claim-retention layer (90 d), column-compatible
-- with v_journeys so the frontend's Journey shape works unchanged. The delay-alerts
-- page reads THIS (not v_journeys): claimables must stay visible/filable for the
-- whole claim window, long after the raw horizon has pruned the journey out of
-- fct_journeys. All rows are claimable by construction (is_claimable is a literal
-- for shape-compatibility).

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
    true as is_claimable,
    canceled,
    line_name,
    line_terminus,
    operator,
    train_owner,
    origin_source,
    destination_source
from {{ ref('fct_claimable_journeys') }}
