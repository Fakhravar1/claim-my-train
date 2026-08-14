{{ config(
    materialized='table',
    indexes=[{'columns': ['origin_local_date']}],
    pre_hook="set local statement_timeout = '600s'"
) }}

-- pre_hook (2026-08-14): this full rebuild scans 14 days of the QUADRATIC fct_journeys
-- view and sorts every row by random() to sample 15 per (day, tier). That work sits right
-- at the build's ~120s statement_timeout and tips over on any DB-pressure spike (it hit
-- 130.94s and cancelled on the 2026-08-14 23:30 UTC build, while the 15 runs before it
-- passed). Raising the timeout for THIS model only is pure upside — the same ~130s of work
-- now commits instead of being thrown away, so v_network_board refreshes and CI goes green.
-- It treats the symptom: the durable fix is to cut the model's cost (narrow the window, or
-- sample at the int_stop_events source) so the quadratic fan-out never has to be sorted.
-- `set local` applies only inside this model's build transaction.

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
    -- Board reaches ~14 days back in the default (non-claimable) view; keep a matching
    -- window. Small regardless: 6 tiers x ~15 rows x 14 days ~= 1.3k rows.
    where origin_local_date >= (current_date - interval '14 days')::date
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
