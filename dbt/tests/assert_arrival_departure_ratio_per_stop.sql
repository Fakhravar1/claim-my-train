-- Singular data test: catches per-stop, per-event-type collapses.
--
-- Context: in May 2026, Triangeln's `arrival` count silently dropped to ~1% of
-- its `departure` count because of an upsert-collision bug in the ingestion
-- function. Nothing in dbt tested for this — every schema test passed, and the
-- regression bled out for a week before being noticed by a user. This test
-- exists so the next time one event type at a stop dries up (or floods), the
-- next scheduled `dbt build` fails loudly.
--
-- Contract (dbt singular test): this query MUST return zero rows on a healthy
-- day. Each returned row is a violation that fails the test.
--
-- Failure rule:
--   For the previous full day (yesterday in DB-local time), for any stop where
--   the larger of (arrival_count, departure_count) is at least 100, the
--   smaller side must be at least 10% of the larger side. A ratio under 0.10
--   is the signature of a one-sided collapse like Triangeln's.
--
-- Why "yesterday, not today": today is partial (the day isn't done yet, and
-- the cron is still filling it), so ratios are noisy. Yesterday is a complete
-- 24-hour window.
--
-- Why "larger side >= 100": ignore low-volume stops at off-hours where a 3:30
-- ratio is meaningless. Calibrate this threshold up as the corridor grows.
--
-- Runs against int_stop_events (the live conformed TV+REST layer; fct_departures
-- was retired 2026-06-13). station_id/station_name/service_date replace the old
-- stop__id/stop__name/trip__start_date.
--
-- KNOWN EXCEPTION — Karlberg (station_id 45985, TV signature 'Ke'), excluded
-- 2026-06-27. This started failing CI scheduled runs (GH Actions run
-- 28282777692 and several before it) once SL pendeltåg stations were
-- onboarded. Investigated directly against raw_train_announcements (not an
-- ingestion-code issue — collect-train-announcements applies one generic
-- query across all ~350 stations, no per-station branching):
--   * Karlberg: 0-2 Ankomst vs 81-190 Avgang per day, stable across 3+
--     consecutive days (2026-06-25..27) — not a transient glitch or a
--     regression that just appeared.
--   * Danish REST corridor stops (the original suspect) checked out fine —
--     all sit at ~0.95-1.00 ratio every day; ruled out, not excluded.
--   * Other minor Skåne intercity stops that most trains pass without
--     stopping (Sösdala, Killeberg, Tjörnarp, Ballingslöv) show a milder
--     version of the same shape (~0.24-0.25 ratio, also stable across days)
--     — supporting that lopsided ratios are a real characteristic of minor/
--     pass-through stops in Trafikverket's feed, not unique to our pipeline.
--     Karlberg is the extreme end of that spectrum, not a different
--     phenomenon, and Trafikverket is the one publishing near-zero Ankomst
--     for it (our query is event-type-agnostic).
-- If a future station shows this pattern, investigate the same way before
-- adding it here — don't widen this list speculatively.
--
-- RESOLVED AND REMOVED 2026-09-05 — the Stockholm pendeltåg summer-2026
-- exception (Huddinge 45550, Stuvsta 772, Häggvik 703, Sollentuna 67244),
-- added 2026-07-12 with an EXPIRES 2026-09-01 bound. The bound did its job:
-- it lapsed on 2026-09-01 and the test did NOT re-fail, i.e. the summer track
-- work ended and normal Ankomst volume returned. Verified 2026-09-05 over
-- 2026-08-31..09-05 (every day past the expiry): Huddinge 0.50-0.60,
-- Stuvsta 0.50-0.60, Häggvik 0.44, Sollentuna 0.44 — all far above the 0.10
-- threshold. The block was dead code from 2026-09-01 onward, so it is gone
-- and these four stations are guarded again. This is the intended lifecycle
-- of a time-bounded exception; keep writing them with a date, not forever.
--
-- TIME-BOUNDED EXCEPTION — Göteborg–Alingsås replacement-bus blockade,
-- added 2026-09-05, EXPIRES 2026-10-01 (the `service_date` bound below).
-- Floda 203, Partille 132, Aspedalen 1011 and Aspen 1012 reported
-- arrival_count = 0 against 105-125 departures on service_date 2026-09-05
-- (a Saturday), having run normal traffic the day before (e.g. Aspedalen
-- 35 arr / 165 dep on 09-04). Investigated 2026-09-05 against
-- raw_train_announcements — this is NOT our pipeline:
--   * raw matches int EXACTLY, row for row (raw Ankomst 0 / Avgang 106 at
--     Asd and Apn, 0/125 Fd, 0/105 P), so nothing is being dropped by the
--     crosswalk join or the dedup; Trafikverket simply published no Ankomst.
--   * 100% of the surviving events carry a "Buss" Deviation naming a road
--     stop — "Buss 22K | Hpl D" (Floda), "Hpl C" (Partille), "Hpl Almekärr"
--     (Aspedalen), "Hpl Ekebacken" (Aspen). These are replacement BUSES on
--     a planned engineering blockade, and Trafikverket publishes only the
--     bus departure from the road stop, never a bus arrival — so a 0-arrival
--     day is the correct representation of the feed, not a collapse.
--   * The day before, the same stops were almost entirely deviation-free
--     ordinary train traffic, which is what makes this a clean step change
--     rather than the Karlberg-class permanent lopsidedness below.
-- Bounded to 2026-10-01 because the blockade's end date is not published in
-- the feed: if buses are still running then the test re-fails and forces a
-- fresh look (extend the bound, or promote to a permanent exception).
-- NOTE for whoever picks this up: a tighter mechanism is available if this
-- recurs often — exclude a (station, day) whose events are ~100% "Buss"
-- deviation, which self-re-arms the moment trains return and needs no date.
-- Deliberately not done here: the repo's precedent is an explicit station
-- list plus a date, and an incident fix is the wrong place to invent a new
-- exception mechanism.
with daily_counts as (
    select
        station_id,
        station_name,
        service_date,
        count(*) filter (where event_type = 'arrival')   as arrival_count,
        count(*) filter (where event_type = 'departure') as departure_count
    from {{ ref('int_stop_events') }}
    where service_date = current_date - 1
      and station_id != '45985'  -- Karlberg, see KNOWN EXCEPTION above
      -- Göteborg–Alingsås replacement-bus blockade, see TIME-BOUNDED EXCEPTION above
      and not (
          station_id in ('203', '132', '1011', '1012')
          and service_date < date '2026-10-01'
      )
    group by 1, 2, 3
),

ratios as (
    select
        station_id,
        station_name,
        service_date,
        arrival_count,
        departure_count,
        greatest(arrival_count, departure_count) as larger,
        least(arrival_count, departure_count)    as smaller
    from daily_counts
)

select
    station_id,
    station_name,
    service_date,
    arrival_count,
    departure_count,
    round(smaller::numeric / nullif(larger, 0), 3) as ratio
from ratios
where larger >= 100
  and (smaller::numeric / nullif(larger, 0)) < 0.10
