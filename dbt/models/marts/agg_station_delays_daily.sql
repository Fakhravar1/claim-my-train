{{ config(
    materialized='incremental',
    unique_key='station_day_key',
    incremental_strategy='delete+insert',
    on_schema_change='sync_all_columns',
    pre_hook="{% if is_incremental() %}delete from {{ this }} where service_date < current_date - interval '400 days'{% else %}select 1{% endif %}",
    post_hook="analyze {{ this }}"
) }}

-- agg_station_delays_daily
-- Per-STATION daily departure-delay aggregate: one row per (station_id, service_date).
-- Powers the /forseningar station SEO pages (via scripts/refresh_station_stats.py →
-- src/content/stationStats.json) and any future "how delayed is station X" surface.
-- NOT part of the claim pipeline.
--
-- Reads int_stop_events (the conformed substrate — all ~440 stations incl. the Danish
-- corridor stops), departures only: "X % av avgångarna i tid" is the stat users read.
--
-- MATERIALIZATION: incremental TABLE that ACCUMULATES past the int prune, same §13
-- pattern as agg_corridor_delays_daily / fct_claimable_journeys. int_stop_events only
-- retains ~5 days, so every run reprocesses service_date >= current_date - 5 d and
-- delete+insert replaces exactly those (station, date) keys; older daily rows are never
-- in the batch, so they survive — history outlives the int horizon. pre_hook caps at
-- 400 d (volume is tiny: ~440 stations × days).
--
-- *** --full-refresh collapses history to the ~5 d int window (same hazard class as the
-- *** other accumulating tables, §10). Don't --full-refresh expecting history back.

with departures as (

    select
        station_id
        ,station_name
        ,service_date
        ,delay_seconds
        ,canceled
    from {{ ref('int_stop_events') }}
    where event_type = 'departure'
      and service_date >= current_date - interval '5 days'
      and service_date < current_date          -- complete days only; today is partial

)

select
    {{ dbt_utils.generate_surrogate_key(['station_id', 'service_date']) }} as station_day_key
    ,station_id
    ,max(station_name)                                   as station_name
    ,service_date
    ,count(*)                                            as n_departures
    ,count(delay_seconds)                                as n_measured        -- NULL delay = no realtime signal
    ,count(*) filter (where delay_seconds >= 300)        as n_late_5          -- >= 5 min
    ,count(*) filter (where delay_seconds >= 1200)       as n_late_20         -- >= 20 min (claim floor)
    ,count(*) filter (where canceled)                    as n_cancelled
    ,sum(greatest(delay_seconds, 0))                     as sum_delay_seconds -- positive delay only (early departures don't offset late ones)
    ,max(delay_seconds)                                  as max_delay_seconds
from departures
group by station_id, service_date
