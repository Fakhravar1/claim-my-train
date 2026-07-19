{{ config(
    materialized='incremental',
    unique_key='stop_event_key',
    incremental_strategy='delete+insert',
    on_schema_change='sync_all_columns',
    indexes=[
      {'columns': ['stop_event_key'], 'unique': True},
      {'columns': ['event_type', 'station_id', 'service_date']},
      {'columns': ['service_number', 'event_type', 'scheduled']}
    ],
    pre_hook="{% if is_incremental() %}delete from {{ this }} where service_date < current_date - interval '91 days'{% else %}select 1{% endif %}",
    post_hook="analyze {{ this }}"
) }}

-- fct_claimable_stop_events
-- The DURABLE claim-retention layer, at STOP-EVENT grain (2026-07-19 storage rework).
-- Replaces the leg-grain fct_claimable_journeys TABLE, which stored the quadratic
-- O-D fan-out (~65 legs per delayed train = C(stops,2)) and was on track to blow the
-- free-tier storage ceiling at 90 d retention. This table stores only the LINEAR
-- *generating set* of those legs (~3.2x smaller, measured):
--
--   * every ARRIVAL that clears the claim FLOOR (>= min threshold across
--     dim_compensation_rules, or cancelled), and
--   * every DEPARTURE of the same service with at least one LATER claimable arrival
--     inside the 12 h pairing window (i.e. every departure that contributes >= 1 leg).
--
-- fct_claimable_journeys is now a VIEW that re-pairs these events into the exact
-- same legs (same journey_key, same columns) — the §13 pattern: persist linear,
-- fan out quadratic lazily, read narrowly.
--
-- Grain: one row per (service_number, station_id, event_type, service_date) —
-- stop_event_key is carried from int_stop_events unchanged, so re-captures of a
-- revised event replace the stored row (delete+insert).
--
-- INCREMENTAL UNIT = the TRAIN, not the event (§5 rule: incremental grain >= the
-- coarsest key any predicate spans). The generating-set filter ("has a later
-- claimable arrival") spans the whole physical run: a departure captured while the
-- train is still en route only becomes storable once a late arrival lands, possibly
-- hours after the departure's ingested_at stopped refreshing. Batching whole trains
-- (any event fresh in the 6 h lookback -> re-emit the train's full generating set)
-- makes that timing gap irrelevant. The +/-1 day slop on service_date covers
-- cross-midnight runs; re-emitting an adjacent day's run is harmless (idempotent
-- delete+insert on stop_event_key).
--
-- Retention = accumulate + prune, same contract as the old leg table:
--   * delete+insert only touches events of trains re-seen in the lookback; older
--     captured events are never rewritten -> they survive upstream pruning
--     (int_stop_events holds ~5 d; this table holds the claim window).
--   * pre_hook prunes past 91 days (one day of slack over the 90 d journey
--     retention so a day-90 origin's cross-midnight arrival still pairs).
--   * Retraction (§13 plan B, accepted): an arrival revised back below the floor
--     inside the lookback simply isn't re-emitted, so its stale captured row (with
--     the old, claimable delay) lingers and the view keeps producing those legs.
--     Rare — delays are settled track measurements by capture time.
--
-- *** NEVER --full-refresh THIS MODEL once it holds events older than the
-- *** int_stop_events horizon (~5 d): a full refresh rebuilds from int and
-- *** permanently drops everything older — the 90-day claim-window guarantee
-- *** silently breaks. Same hazard class the old fct_claimable_journeys table had.
-- *** (History note: rows for origin dates 2026-06-01..2026-07-19 were backfilled
-- *** from the retired leg table on 2026-07-19; they are not reconstructible.)

with
{% if is_incremental() %}
-- TRAIN-level batch: any train with at least one event ingested inside the lookback.
fresh_trains as (

    select distinct service_number, service_date
    from {{ ref('int_stop_events') }}
    where ingested_at >= (select max(ingested_at) from {{ this }}) - interval '6 hours'

),
{% endif %}

-- Claim FLOOR (same aggregate as fct_journeys): most lenient regime across all
-- authorities. Keeps this layer a safe SUPERSET of every operator's rule (§6).
authority as (

    select
        min(min_delay_seconds)          as min_delay_seconds,
        bool_or(includes_cancellations) as includes_cancellations
    from {{ ref('dim_compensation_rules') }}

),

events as (

    select e.*
    from {{ ref('int_stop_events') }} e
    {% if is_incremental() %}
    where exists (
        select 1
        from fresh_trains f
        where f.service_number = e.service_number
          and e.service_date between f.service_date - 1 and f.service_date + 1
    )
    {% endif %}

),

claimable_arrivals as (

    select e.*
    from events e
    cross join authority auth
    where e.event_type = 'arrival'
      and (
            coalesce(e.delay_seconds, 0) >= auth.min_delay_seconds
         or (auth.includes_cancellations and coalesce(e.canceled, false))
      )

),

-- Departures that generate at least one claimable leg: same pairing predicates as
-- the fct_claimable_journeys view (12 h window, no self-loop, date-bounded). A
-- departure failing this EXISTS contributes zero legs and is not stored.
generating_departures as (

    select d.*
    from events d
    where d.event_type = 'departure'
      and exists (
        select 1
        from claimable_arrivals a
        where a.service_number = d.service_number
          and a.scheduled >  d.scheduled
          and a.scheduled <= d.scheduled + interval '12 hours'
          and a.station_id <> d.station_id
          and a.service_date >= d.service_date
          and a.service_date <= d.service_date + 1
      )

)

select
    stop_event_key,
    service_number,
    station_id,
    station_name,
    transport_mode,
    event_type,
    service_date,
    scheduled,
    realtime,
    delay_seconds,
    canceled,
    line_name,
    line_terminus,
    operator,
    train_owner,
    deviation,
    -- boolean instead of the raw timestamp: the journey view only needs "was this
    -- delay known in advance", and a boolean survives the leg-table backfill (which
    -- had already collapsed the timestamp to a flag)
    (planned_estimated_time is not null) as has_planned_delay,
    source,
    ingested_at,
    current_timestamp as captured_at
from claimable_arrivals

union all

select
    stop_event_key,
    service_number,
    station_id,
    station_name,
    transport_mode,
    event_type,
    service_date,
    scheduled,
    realtime,
    delay_seconds,
    canceled,
    line_name,
    line_terminus,
    operator,
    train_owner,
    deviation,
    (planned_estimated_time is not null) as has_planned_delay,
    source,
    ingested_at,
    current_timestamp as captured_at
from generating_departures
