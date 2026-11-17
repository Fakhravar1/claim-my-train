{{ config(
    materialized='incremental',
    incremental_strategy='delete+insert',
    unique_key='origin_local_date',
    indexes=[{'columns': ['origin_local_date']}],
    post_hook="delete from {{ this }} where origin_local_date < current_date - 14"
) }}

-- agg_network_board
-- Precomputed representative SAMPLE for the "/" Daylight board's default (no-selection)
-- view. fct_journeys is a quadratic VIEW whose per-day scan grew with the network
-- (~240k journeys/day at ~450 stations); sampling it live per page load timed out under
-- anon's 3s statement_timeout, so the public board silently showed nothing. This builds
-- the sample ONCE per `dbt build` instead: up to N journeys per (origin_local_date,
-- display tier) over a recent window, so the board reads a tiny pre-built pool (<100ms)
-- and shuffles client-side for per-load variety (src/hooks/useNetworkBoard.ts).
--
-- `tier` mirrors the DISPLAY buckets in src/lib/daylightStatus.ts — visual only, NOT the
-- claim rule (is_claimable stays authoritative).
--
-- INCREMENTAL (2026-11-17): each build re-samples only TODAY and YESTERDAY (delete+insert
-- by origin_local_date) and keeps older days frozen. The old full rebuild re-paired and
-- random-sorted every retained day of the quadratic fct_journeys each hour and hit the
-- 120 s statement timeout (runs 5585, 5616). Older days are settled, so freezing their
-- sample loses nothing; today/yesterday still rotate every build. The post_hook trims to
-- the board's 14-day window. A --full-refresh is safe (derived sample, no history lost
-- beyond what int_stop_events still holds) but is the slow path again.
-- NB the sample lags `dbt build` (~1 h) — fine: the board caches 5 min and isn't real-time critical; O-D / claimable browsing still reads v_journeys live.

with j as (
    select
        *,
        case
            when canceled then 'cancelled'
            when destination_delay_minutes >= 40 then 'severe'
            when destination_delay_minutes >= 20 then 'eligible'
            when destination_delay_minutes >= 15 then 'near'
            when destination_delay_minutes >= 4  then 'minor'
            else 'ontime'
        end as tier
    from {{ ref('fct_journeys') }}
    -- Board reaches ~14 days back in the default (non-claimable) view; keep a matching
    -- window. Small regardless: 6 tiers x ~15 rows x 14 days ~= 1.3k rows.
    {% if is_incremental() %}
    where origin_local_date >= current_date - 1
    {% else %}
    where origin_local_date >= (current_date - interval '14 days')::date
    {% endif %}
),

ranked as (
    select
        *,
        row_number() over (partition by origin_local_date, tier order by random()) as _rn
    from j
)

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
from ranked
where _rn <= 15
