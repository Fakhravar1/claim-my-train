{{ config(
    materialized='incremental',
    unique_key='operator_day_key',
    incremental_strategy='delete+insert',
    on_schema_change='sync_all_columns',
    pre_hook="{% if is_incremental() %}delete from {{ this }} where service_date < current_date - interval '400 days'{% else %}select 1{% endif %}",
    post_hook="analyze {{ this }}"
) }}

-- agg_operator_delays_daily
-- Per-OPERATOR-LABEL daily TRAIN-delay aggregate: one row per (operator_label,
-- service_date). Powers the /forseningar/tag/<operator> SEO pages (via
-- scripts/refresh_station_stats.py → src/content/operatorStats.json).
-- NOT part of the claim pipeline — descriptive display only (§5/§8: operator
-- is never a rule key; the label here is the FEED's marking, kept raw).
--
-- Grain is the TRAIN, not the stop-event: "X % av SJ:s tåg var minst 20 min
-- sena" — counting stop-events would count one train once per station. A
-- train's delay is the MAX over its measured stops (was it EVER >= threshold),
-- and its label is the mode() of coalesce(operator, train_owner) across its
-- events (information_owner is null for most SJ trains — train_owner is the
-- §14-verified fallback; a train relabelled at contract seams resolves to its
-- majority label). Labels stay RAW ('Ö-TÅG', 'SKANE', 'Mälardalstrafik AB');
-- the brand merge (Ö-TÅG + Öresundståg + VR Sverige AB → "Öresundståg") lives
-- in src/content/operatorStats.ts, next to the display mapping it must match.
--
-- MATERIALIZATION: incremental TABLE that ACCUMULATES past the int prune, same
-- §13 pattern as agg_station_delays_daily. int_stop_events only retains ~5
-- days, so every run reprocesses service_date >= current_date - 5 d and
-- delete+insert replaces exactly those (label, date) keys; older daily rows
-- are never in the batch, so they survive. pre_hook caps at 400 d (volume is
-- tiny: ~45 labels × days).
--
-- *** --full-refresh collapses history to the ~5 d int window (same hazard
-- *** class as the other accumulating tables, §10).

with events as (

    select
        service_number
        ,service_date
        ,coalesce(operator, train_owner) as operator_label
        ,delay_seconds
        ,canceled
    from {{ ref('int_stop_events') }}
    where service_date >= current_date - interval '5 days'
      and service_date < current_date          -- complete days only; today is partial

),

trains as (

    select
        service_number
        ,service_date
        ,mode() within group (order by operator_label) as operator_label
        ,max(delay_seconds)                            as max_delay_seconds
        ,count(delay_seconds) > 0                      as is_measured   -- any stop with a realtime signal
        ,bool_or(coalesce(canceled, false))            as canceled
    from events
    group by service_number, service_date

)

select
    {{ dbt_utils.generate_surrogate_key(['operator_label', 'service_date']) }} as operator_day_key
    ,operator_label
    ,service_date
    ,count(*)                                                          as n_trains
    ,count(*) filter (where is_measured)                               as n_measured
    ,count(*) filter (where max_delay_seconds >= 300)                  as n_late_5   -- >= 5 min at some stop
    ,count(*) filter (where max_delay_seconds >= 1200)                 as n_late_20  -- >= 20 min (claim floor)
    ,count(*) filter (where canceled)                                  as n_cancelled
    ,sum(greatest(max_delay_seconds, 0)) filter (where is_measured)    as sum_delay_seconds
    ,max(max_delay_seconds)                                            as max_delay_seconds
from trains
where operator_label is not null    -- extra-/ersättningståg with every owner field null
group by operator_label, service_date
