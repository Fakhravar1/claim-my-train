{{ config(
    materialized='incremental',
    unique_key='journey_key',
    incremental_strategy='delete+insert',
    on_schema_change='sync_all_columns',
    pre_hook="{% if is_incremental() %}delete from {{ this }} where origin_local_date < current_date - interval '90 days'{% else %}select 1{% endif %}"
) }}

-- fct_claimable_journeys
-- The DURABLE claim-retention layer: every journey that was ever claimable, kept for
-- 90 days regardless of upstream pruning. Claim windows are operator-dependent
-- (60 d regional reklamation vs 90 d) — retention uses the MAX of the regimes,
-- because keeping a claimable too long costs kilobytes while pruning it too early
-- silently destroys a user's claim. Per-operator pruning moves to
-- dim_compensation_rules when operator #2 lands (§9 v3). Substrates are short-lived
-- (REST raw 10 d; int_stop_events bounded by raw at full-refresh), but a user can
-- file long after the delay happened — this table is what guarantees the claimable
-- set survives until the filing deadline passes. The delay-alerts page reads it
-- via public.v_claimable_journeys.
--
-- Rebuilt 2026-06-11 on the unified chain: reads fct_journeys (TV+REST), journey_key
-- grain (service_number, origin_local_date, origin_stop_id, destination_stop_id).
-- All rows are claimable by construction (filter below), so no is_claimable column.
--
-- Retention = accumulate + prune:
--  * delete+insert on journey_key only touches journeys re-seen in the 6 h lookback;
--    older captured rows are never rewritten -> they survive upstream pruning.
--  * pre_hook deletes rows past 60 days each incremental run (self-maintaining; no
--    pg_cron needed). Operator-aware windows (60 vs 90 d) move to
--    dim_compensation_rules when operator #2 lands (§9 v3) — until then, 60 d flat.
--  * Retraction (§13 plan B, accepted): a journey that flips below the threshold
--    inside the lookback emits no row, so its stale captured row lingers. Rare —
--    delays are settled track measurements by capture time.
--
-- *** NEVER --full-refresh THIS MODEL once it holds rows older than the raw
-- *** horizon: a full refresh rebuilds from fct_journeys, which only reaches as far
-- *** back as raw retention (~10 d) — everything older is permanently lost and the
-- *** 60-day claim guarantee silently breaks. Same hazard class as fct_departures
-- *** (§10), but here it defeats the table's entire purpose.

select
    journey_key,
    service_number,
    origin_local_date,
    origin_stop_id,
    destination_stop_id,
    transport_mode,
    origin_stop_name,
    destination_stop_name,
    line_name,
    line_terminus,
    operator,
    train_owner,
    origin_source,
    destination_source,
    origin_scheduled,
    origin_actual,
    destination_scheduled,
    destination_actual,
    destination_delay_seconds,
    destination_delay_minutes,
    origin_deviation,
    destination_deviation,
    has_planned_delay,
    route_distance_km,
    canceled,
    ingested_at,
    current_timestamp as captured_at
from {{ ref('fct_journeys') }}
where is_claimable
{% if is_incremental() %}
  and ingested_at >= (select max(ingested_at) from {{ this }}) - interval '6 hours'
{% endif %}
