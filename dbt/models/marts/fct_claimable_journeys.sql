{{ config(materialized='view') }}

-- fct_claimable_journeys
-- The durable claimable-journey set, now a VIEW (2026-07-19 storage rework; was an
-- incremental leg-grain TABLE). Storage moved to fct_claimable_stop_events (linear,
-- ~3.2x smaller — see that model's header): this view re-pairs those events into
-- the exact same legs the old table stored — same journey_key (same surrogate-key
-- inputs), same columns — so public.v_claimable_journeys and every consumer
-- (claims matching, digest_log, old digest-email links) work unchanged.
--
-- The pairing REPLICATES fct_journeys' logic (12 h same-service window, cross-
-- midnight date bound, earliest-arrival dedup, coords -> route_distance_km). It is
-- deliberately DUPLICATED, not shared via macro, so this rework cannot touch the
-- flagship fact; the singular test assert_claimable_layer_covers_fct_journeys
-- guards the two against drifting apart. If you change fct_journeys' pairing,
-- mirror it here.
--
-- All rows are claimable by construction: the events table only stores arrivals
-- that cleared the claim FLOOR (and the departures that generate legs to them), so
-- no is_claimable column — identical to the old table's contract.
--
-- Grain: one row per (service_number, origin_local_date, origin_stop_id,
-- destination_stop_id) — tested (recent window; older rows are frozen history).
--
-- Reads are only fast when a predicate can prune the origin scan (origin_local_date
-- / origin_stop_id push down into the events indexes). A bare journey_key IN (...)
-- filter cannot push down (the key is a hash) and recomputes the pairing over the
-- full 90 d — pair such reads with an origin_local_date bound (the digest URLs
-- carry one since v8).

with departures as (
    select * from {{ ref('fct_claimable_stop_events') }} where event_type = 'departure'
),

arrivals as (
    select * from {{ ref('fct_claimable_stop_events') }} where event_type = 'arrival'
),

-- Same duplicate-run hazard as fct_journeys: a service_number reused inside the 12 h
-- window can pair one origin with two same-station arrivals -> one journey_key.
-- Dedup keeps the EARLIEST arrival per grain, matching fct_journeys' choice.
paired as (

select
    {{ dbt_utils.generate_surrogate_key([
        'origin.service_number',
        'origin.service_date',
        'origin.station_id',
        'dest.station_id'
    ]) }} as journey_key,

    origin.service_number,
    origin.service_date            as origin_local_date,
    origin.station_id              as origin_stop_id,
    dest.station_id                as destination_stop_id,

    origin.transport_mode,

    origin.station_name            as origin_stop_name,
    dest.station_name              as destination_stop_name,
    coalesce(origin.line_name, dest.line_name)           as line_name,
    coalesce(origin.line_terminus, dest.line_terminus)   as line_terminus,
    case
        when origin.source = 'tv' then origin.operator
        when dest.source   = 'tv' then dest.operator
        else coalesce(origin.operator, dest.operator)
    end                            as operator,
    coalesce(origin.train_owner, dest.train_owner)       as train_owner,

    origin.source                  as origin_source,
    dest.source                    as destination_source,

    origin.scheduled               as origin_scheduled,
    origin.realtime                as origin_actual,
    dest.scheduled                 as destination_scheduled,
    dest.realtime                  as destination_actual,

    dest.delay_seconds                      as destination_delay_seconds,
    round(dest.delay_seconds / 60.0, 1)     as destination_delay_minutes,

    origin.deviation               as origin_deviation,
    dest.deviation                 as destination_deviation,
    (origin.has_planned_delay or dest.has_planned_delay)  as has_planned_delay,

    -- Great-circle O-D distance x ~1.2 detour factor (same formula/caveats as
    -- fct_journeys — approximate near the 150 km regime edge; NULL without coords).
    case
        when oc.lat is not null and dc.lat is not null then
            round(
                (6371 * acos(least(1.0, greatest(-1.0,
                    cos(radians(oc.lat)) * cos(radians(dc.lat)) * cos(radians(dc.lon - oc.lon))
                    + sin(radians(oc.lat)) * sin(radians(dc.lat))
                ))) * 1.2)::numeric
            , 1)
    end                                     as route_distance_km,

    dest.canceled,

    greatest(origin.ingested_at, dest.ingested_at) as ingested_at,
    greatest(origin.captured_at, dest.captured_at) as captured_at,

    row_number() over (
        partition by origin.service_number, origin.service_date, origin.station_id, dest.station_id
        order by dest.scheduled asc
    ) as _rn

from departures as origin
join arrivals as dest
    on  origin.service_number = dest.service_number
    and dest.scheduled >  origin.scheduled
    and dest.scheduled <= origin.scheduled + interval '12 hours'
    and origin.station_id <> dest.station_id
    -- date bound: dest is origin's day or the next (cross-midnight), never earlier —
    -- lets a date-filtered read prune the arrival index scan (perf note in fct_journeys)
    and dest.service_date >= origin.service_date
    and dest.service_date <= origin.service_date + 1
left join {{ ref('dim_station_coords') }} oc on oc.stop__id = origin.station_id
left join {{ ref('dim_station_coords') }} dc on dc.stop__id = dest.station_id
)

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
    captured_at
from paired
where _rn = 1
