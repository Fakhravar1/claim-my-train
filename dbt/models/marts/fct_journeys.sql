{{ config(materialized='view') }}

-- fct_journeys
-- THE journey fact the frontend reads (via public.v_journeys). Built by pairing the
-- disjoint stop-events in int_stop_events: an origin DEPARTURE joined to a later
-- ARRIVAL of the same service. Each leg comes from whichever feed owns that stop
-- (TV = Swedish, REST = Danish) — origin_source / destination_source say which.
--
-- Trains only for now; future modes (tram, boat) flow in through int_stop_events
-- and surface here via transport_mode — the column contract is mode-agnostic
-- (service_number, not train_number; line_name, not route__name).
--
-- Grain: one row per (service_number, origin_local_date, origin_stop_id, destination_stop_id).
--
-- Pairing key is (service_number) within a bounded time window, NOT service_date equality:
--  * service numbers recycle daily, so the < 12h window keeps each physical run separate
--    from the next day's run (~24h later);
--  * a window (not same-date) is required so a 23:5x departure still pairs with its
--    00:xx next-day arrival (§6 cross-midnight). Journey date = the ORIGIN's local date.
-- No stop_sequence (TV has none): origin precedes destination by scheduled time.

with departures as (
    select * from {{ ref('int_stop_events') }} where event_type = 'departure'
),

arrivals as (
    select * from {{ ref('int_stop_events') }} where event_type = 'arrival'
),

-- Claim FLOOR, not the per-operator rule. is_claimable here is used only for DISPLAY and
-- for the durable retention layer (fct_claimable_journeys / v_claimable_journeys): it flags
-- a journey claimable under the MOST LENIENT regime across all authorities (the 20-min/cancel
-- floor today). That keeps retention a safe SUPERSET — a stricter 60-min set is a subset of
-- the 20-min set, so no SJ-claimable journey is ever pruned. The BINDING per-user rule (does
-- THIS journey clear the threshold for the user's attested operator, and at what tier %) is
-- resolved lazily downstream by public.claim_eligibility(...) keyed on profiles.purchasing_operator
-- + route_distance_km (§8: user-side resolution stays lazy; §5: rules attach to authority +
-- route characteristics, never operator-as-rule-key). Single-row aggregate -> grain preserved.
-- NEVER let dim_compensation_rules go empty — the cross join would drop every journey; the
-- seed's not_null tests guard that.
authority as (
    select
        min(min_delay_seconds)         as min_delay_seconds,
        bool_or(includes_cancellations) as includes_cancellations
    from {{ ref('dim_compensation_rules') }}
),

-- Pair each origin departure to its destination arrival. A service_number is reused by
-- different physical runs, and the (service_number, 12h window) join carries no run identity,
-- so an origin can match MORE THAN ONE same-numbered arrival at the same destination station
-- (two runs of train 24 sharing a Stockholm arrival -> two dest rows -> ONE journey_key, since
-- the key ignores dest.scheduled). That duplicates the grain. Dedup below keeps the EARLIEST
-- arrival per grain (the true run), which preserves the real delay and drops zero legitimate
-- journeys. Partition on the SAME business keys that build journey_key (can't reference the
-- journey_key alias in a window in the same select).
paired as (

select
    {{ dbt_utils.generate_surrogate_key([
        'origin.service_number',
        'origin.service_date',
        'origin.station_id',
        'dest.station_id'
    ]) }} as journey_key,

    -- natural grain (unified, mode-agnostic vocabulary)
    origin.service_number,
    origin.service_date            as origin_local_date,    -- the calendar day the origin departure physically runs (frontend date filter)
    origin.station_id              as origin_stop_id,       -- text natively in int_stop_events; matches v_active_stations.stop__id
    dest.station_id                as destination_stop_id,

    origin.transport_mode,                                  -- 'train' for now

    -- descriptive attributes. Line/operator are display-only (§8: never rule keys) and
    -- coalesced across BOTH legs: a TV leg has no line concept, so a tv->rest journey
    -- inherits the REST leg's line name ("Ö Karlskrona - ... - København"). Operator
    -- prefers the TV leg's label — int maps it from TV's information_owner, the brand
    -- users recognize ("Öresundståg", "Skånetrafiken", "SJ") — over REST's corporate
    -- agency__operator ("VR Sverige AB"); rest->rest journeys fall back to REST's.
    origin.station_name            as origin_stop_name,
    dest.station_name              as destination_stop_name,
    coalesce(origin.line_name, dest.line_name)           as line_name,
    coalesce(origin.line_terminus, dest.line_terminus)   as line_terminus,
    case
        when origin.source = 'tv' then origin.operator
        when dest.source   = 'tv' then dest.operator
        else coalesce(origin.operator, dest.operator)
    end                            as operator,
    -- TV operator code (train_owner) — the SECONDARY auto-routing signal used when the
    -- information_owner-derived `operator` is null (esp. SJ). TV-only, so a plain coalesce
    -- picks whichever leg has it. Descriptive-only (§8: never a rule key).
    coalesce(origin.train_owner, dest.train_owner)       as train_owner,

    -- which feed supplied each leg (TV Swedish vs REST Danish) — source audit
    origin.source                  as origin_source,
    dest.source                    as destination_source,

    -- timing
    origin.scheduled               as origin_scheduled,
    origin.realtime                as origin_actual,
    dest.scheduled                 as destination_scheduled,
    dest.realtime                  as destination_actual,

    -- delay measures (v1: delay at destination only)
    dest.delay_seconds                      as destination_delay_seconds,
    round(dest.delay_seconds / 60.0, 1)     as destination_delay_minutes,

    -- Great-circle O-D distance (km) x a ~1.2 detour factor to approximate rail distance.
    -- This is what picks the legal regime in dim_compensation_rules / claim_eligibility:
    -- <150 km = Swedish regional regime, >=150 km = EU 2021/782. APPROXIMATE near the 150 km
    -- band edge (straight-line underestimates real track length); the only journeys this can
    -- misclassify are routes straddling that boundary (§ legal nuance, _marts.yml). NULL when
    -- either endpoint lacks coords (e.g. an unresolved crosswalk) — claim_eligibility then
    -- defaults the unknown distance to the conservative (long-distance / higher-threshold) band.
    case
        when oc.lat is not null and dc.lat is not null then
            round(
                (6371 * acos(least(1.0, greatest(-1.0,
                    cos(radians(oc.lat)) * cos(radians(dc.lat)) * cos(radians(dc.lon - oc.lon))
                    + sin(radians(oc.lat)) * sin(radians(dc.lat))
                ))) * 1.2)::numeric
            , 1)
    end                                     as route_distance_km,

    -- Claim FLOOR (display + retention only, NOT the per-operator rule): clears the most
    -- lenient regime across dim_compensation_rules (auth = the min threshold / any-cancel
    -- aggregate above) -> today delay >= 1200 OR canceled. Binding per-user eligibility is
    -- resolved by public.claim_eligibility(...) on purchasing_operator + route_distance_km.
    (coalesce(dest.delay_seconds, 0) >= auth.min_delay_seconds)
        or (auth.includes_cancellations and coalesce(dest.canceled, false))   as is_claimable,

    dest.canceled,

    -- watermark for incremental consumers (fct_claimable_journeys): the freshest
    -- ingestion touching either leg. Excluded from the public wrapper (plumbing).
    greatest(origin.ingested_at, dest.ingested_at) as ingested_at,

    -- dedup rank: earliest destination arrival per grain wins (see paired CTE comment)
    row_number() over (
        partition by origin.service_number, origin.service_date, origin.station_id, dest.station_id
        order by dest.scheduled asc
    ) as _rn

from departures as origin
join arrivals as dest
    on  origin.service_number = dest.service_number
    and dest.scheduled >  origin.scheduled
    and dest.scheduled <= origin.scheduled + interval '12 hours'   -- one physical run; excludes next-day recurrence
    and origin.station_id <> dest.station_id                       -- O-D legs only; drop self-loops from services that revisit a stop
    -- Perf: bound the arrival's service_date to the origin's day (or the next, for a
    -- cross-midnight run). service_date = (scheduled at tz 'Europe/Stockholm')::date on
    -- BOTH legs, and dest.scheduled is always later than origin.scheduled by <= 12h, so
    -- dest.service_date is exactly origin.service_date or +1 — NEVER earlier. This drops
    -- ZERO journeys but lets a date-filtered read (the board's origin_local_date = X) prune
    -- the arrival index scan to 1-2 days instead of scanning ALL retained arrivals: a single
    -- filtered v_journeys read went 9.5s -> 0.37s (matters now the network is ~450 stations /
    -- ~240k journeys/day, and anon has a 3s statement_timeout, so the un-pruned scan timed out
    -- and the public board silently showed nothing).
    and dest.service_date >= origin.service_date
    and dest.service_date <= origin.service_date + 1
cross join authority as auth                                        -- single-row claim FLOOR (min across dim_compensation_rules)
left join {{ ref('dim_station_coords') }} oc on oc.stop__id = origin.station_id   -- origin coords for route_distance_km
left join {{ ref('dim_station_coords') }} dc on dc.stop__id = dest.station_id     -- destination coords
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
    route_distance_km,
    is_claimable,
    canceled,
    ingested_at
from paired
where _rn = 1   -- keep only the earliest arrival per grain; removes the same-number-run duplicates
