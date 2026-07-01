-- Singular data test: catches "hollow" stations — the §14 trap.
--
-- Context: a station board in these feeds is ASSEMBLED per-train from whatever realtime
-- source covers that train, not measured at the station. If a station/operator-mode isn't
-- genuinely onboarded, its rows fall back to the scheduled time but still look realised —
-- delay is ALWAYS exactly 0. REST is hollow for many Swedish operators (SJ/Pågatåg/Vy via
-- REST, all Västtrafik); Trafikverket is genuine because it measures track circuits. As we
-- expand coverage (e.g. southern Sweden infill 2026-06-30), the risk is onboarding a station
-- whose feed is hollow — it would show "live" departures that can never be claimable, because
-- delay never moves off zero. §14 mandates checking `realtime <> scheduled` on a meaningful
-- share of rows before trusting a new station; this test enforces that automatically.
--
-- Contract (dbt singular test): zero rows = PASS. A returned row is a station with plenty of
-- REALISED events but not a single non-zero delay across a multi-day window = hollow signature.
--
-- Failure rule: over the last 3 COMPLETE days (yesterday back 3, excluding the partial
-- current day), for any station with >= 100 realised events (realtime is not null), at least
-- ONE event must have a non-zero delay. Genuine track-measured data has sub-minute deviations
-- everywhere (TV arrival avg ~46s) — 100+ realised events all EXACTLY zero is the unmistakable
-- signature of a fallback/hollow feed, not a punctual station. Threshold 100 ignores tiny
-- pass-through stops where an all-zero day is just low volume; raise it as the network grows.

with per_station as (
    select
        station_id,
        station_name,
        source,
        count(*) filter (where realtime is not null) as realised_events,
        count(*) filter (
            where realtime is not null
              and delay_seconds is distinct from 0
        ) as nonzero_delay_events
    from {{ ref('int_stop_events') }}
    where service_date between current_date - 3 and current_date - 1
    group by station_id, station_name, source
)

select
    station_id,
    station_name,
    source,
    realised_events,
    nonzero_delay_events
from per_station
where realised_events >= 100
  and nonzero_delay_events = 0
