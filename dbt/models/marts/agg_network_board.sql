{{ config(materialized='table', indexes=[{'columns': ['origin_local_date']}]) }}

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
-- claim rule (is_claimable stays authoritative). random() is re-rolled every build so the
-- sampled pool rotates. NB the sample lags `dbt build` (~15 min) — fine: the board caches
-- 5 min and isn't real-time critical; O-D / claimable browsing still reads v_journeys live.

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
    -- Window is bounded by int_stop_events' RETENTION, not by the board's reach. The
    -- board's default view nominally goes ~14 days back, but fct_journeys is a view over
    -- int_stop_events, which pg_cron job 13 prunes to ~5 days (measured span 2026-08-19:
    -- 6 days). Days 7-14 therefore hold zero rows and only cost the planner selectivity
    -- on the quadratic pairing view — this build step measured ~50s every 15 min, the
    -- largest recurring load on the instance (2026-08-18 saturation incident).
    -- Keep this >= the int_stop_events retention window: if job 13's retention is ever
    -- raised, raise this to match or the board silently loses the extra days.
    where origin_local_date >= (current_date - interval '7 days')::date
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
