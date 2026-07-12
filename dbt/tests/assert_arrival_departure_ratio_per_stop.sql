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
-- TIME-BOUNDED EXCEPTION — Stockholm pendeltåg summer 2026 service change,
-- added 2026-07-12, EXPIRES 2026-09-01 (the `service_date` bound below).
-- On 2026-07-11 Trafikverket's feed collapsed Ankomst for several Stockholm
-- pendeltåg stations while Avgang simultaneously dropped ~40% on BOTH trunks
-- — Huddinge 45550 (arr 130→10), Stuvsta 772 (130→10), Häggvik 703 (128→12),
-- Sollentuna 67244 (137→54, one bad day from tripping), plus Mölnbo 715 on
-- Nyköpingsbanan in milder form (not excluded). Investigated 2026-07-12:
-- raw_train_announcements shows the IDENTICAL collapse, so this is
-- Trafikverket publishing fewer announcements (planned summer track work /
-- reduced timetable that started 2026-07-11), not our pipeline — the
-- collector is station-agnostic and int matches raw row-for-row. The
-- exception is date-bounded rather than permanent: if the feed still looks
-- like this after 2026-09-01, the test re-fails and forces a fresh look
-- (either the works were extended — extend the bound — or these stations
-- have become permanent Karlberg-class exceptions).
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
      -- Stockholm pendeltåg summer 2026 works, see TIME-BOUNDED EXCEPTION above
      and not (
          station_id in ('45550', '703', '772', '67244')
          and service_date < date '2026-09-01'
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
