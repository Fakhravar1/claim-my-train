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
-- Why "larger side >= 50": ignore low-volume stops at off-hours where a 3:30
-- ratio is meaningless. Was 100 over ALL events; it is 50 over ADVERTISED
-- calls only, which guards more stations than the old pair did -- see
-- UNADVERTISED-PASSAGE EXCLUSION below.
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
--
-- UNADVERTISED-PASSAGE EXCLUSION (added 2026-10-11). Rows with no
-- `operator` (Trafikverket's InformationOwner) are excluded from the counts,
-- and the volume threshold drops 100 -> 50 to pay for the rows that removes.
--
-- Why: Trafikverket publishes TWO different kinds of event at a station. An
-- advertised passenger CALL carries an InformationOwner (plus From/To
-- location). A train that merely PASSES THROUGH without stopping is published
-- as an Avgang-only passage with InformationOwner, FromLocation and
-- ToLocation all null. Passage events are one-sided by construction, so they
-- inflate the departure side of a ratio that is meant to measure passenger
-- calls -- and no passenger boards a passage, so it can never generate a
-- claim. ~20% of TV rows are this class on a normal day.
--
-- Evidence (2026-10-11, the failure that prompted this -- GH Actions run
-- 38089744499). On Sat 2026-10-10 the Malmo Kontinentalbanan loop had its
-- advertised service almost entirely suspended while the line carried
-- diverted through-traffic. Ostervarn 1483, Rosengard 1621 and Persborg 1486
-- all reported arr 3 / dep 136, where the Friday before was arr 66 / dep 83:
--
--                        all events        advertised only
--   Ostervarn/Rosengard/Persborg  3 / 136        3 / 3
--
-- i.e. 129 of the 136 "departures" were null-owner passages (train_owner
-- SKANE/SNALL/SJ, 134 of 136 realised). raw_train_announcements shows the
-- identical shape, so this is the feed describing through-movements, not our
-- pipeline dropping arrivals. Under the advertised-only count those three
-- stations fall below the volume threshold and are simply untested that day,
-- the same as any other low-volume day.
--
-- Like the replacement-bus rule below this is a MECHANISM exclusion, not
-- another station list: it needs no expiry, and it self-applies to any future
-- diversion or weekend closure instead of permanently blinding the test to
-- three real stations over a one-day engineering event.
--
-- Why the threshold moves 100 -> 50: the filter removes ~20% of events, which
-- would have pushed 49 of the 113 currently-guarded stations below a
-- threshold of 100. Measured over 2026-10-06..10 (service_date = yesterday,
-- 412-413 stations in scope each day):
--   threshold 100 -> 64 stations guarded, 0 violations
--   threshold  50 -> 127 stations guarded, 0 violations   <- chosen
--   threshold  40 -> 166 stations guarded, 0 violations
-- So advertised-only + 50 guards MORE stations than the old all-events + 100
-- (127 vs 113) while dropping the false-alarm class. 40 was also clean over
-- that window but only five days of evidence back it, so 50 is the
-- conservative step; lower it further only with more history.
--
-- The founding Triangeln case is untouched: Triangeln 2026-10-10 is 193/193
-- events and 193/193 advertised, so a one-sided ingestion collapse there
-- still trips the rule with wide margin. Stockholm C (the SJ trunk hub, where
-- InformationOwner is sparser) goes 245/234 -> 242/232, i.e. SJ coverage is
-- preserved -- advertised SJ calls DO carry an InformationOwner; it is only
-- the passages that do not.
-- REPLACEMENT-BUS EXCLUSION (added 2026-09-06). Rows whose Trafikverket
-- Deviation marks them as a replacement bus ("Buss", "Buss 22K", "Buss
-- ersätter", …) are excluded from the counts entirely.
--
-- Why: during planned track work Trafikverket publishes the replacement bus
-- as an **Avgang-only** event at the affected stops — a departure from a
-- named bus stop ("Hpl C", "Hpl Almekärr") with NO matching Ankomst. That is
-- a one-sided count by construction, not a collapse, so the ratio rule is
-- meaningless for those rows and fires a false alarm every time a line goes
-- over to buses for a weekend.
--
-- Evidence (2026-09-06, the failure that prompted this): the Göteborg–
-- Alingsås commuter line went to replacement buses on Sat 2026-09-05.
-- Aspedalen 1011, Aspen 1012, Partille 132 and Floda 203 all reported
-- arr 0 / dep 105–125 where the Friday before was arr 33–72 / dep ~160.
-- **100% of the Saturday departures carried a `Buss` + `Hpl <x>` deviation**;
-- raw_train_announcements shows the identical shape, so this is the feed
-- describing buses, not our pipeline dropping arrivals. Jonsered 15675 and
-- Stenkullen 1315 had the same shape below the 100-event threshold, and
-- Lerum 540 a partial version — i.e. the whole line, exactly matching the
-- published works.
--
-- This is deliberately a MECHANISM exclusion, not another station list: it
-- needs no expiry, it self-applies to any future line that goes to buses,
-- and it removes only the bus rows — genuine train events at the same stop
-- are still counted and still guarded. If a stop is served ONLY by buses for
-- a period it simply falls under the >=100 threshold and is untested, the
-- same as any other low-volume day.
--
-- RESOLVED — Stockholm pendeltåg summer 2026 service change (exception added
-- 2026-07-12 with an expiry of 2026-09-01, REMOVED 2026-09-06).
-- The expiry did its job: it lapsed on schedule and forced this fresh look.
-- Re-measured 2026-09-06 over 2026-09-01..05, the four stations have fully
-- recovered and are nowhere near the 0.10 threshold — Huddinge 45550 and
-- Stuvsta 772 at ratio 0.50–0.60, Häggvik 703 and Sollentuna 67244 at 0.44
-- (vs the 0.08 that tripped it in July). The summer track work ended, so the
-- exclusion is dead code and is deleted rather than extended; those four
-- stations are guarded by this test again. Kept for the record so a future
-- reader knows the outcome, not just that an exception once existed.
--
-- (historical detail of that incident, for pattern-matching)
-- On 2026-07-11 Trafikverket's feed collapsed Ankomst for several Stockholm
-- pendeltåg stations while Avgang simultaneously dropped ~40% on BOTH trunks
-- — Huddinge 45550 (arr 130→10), Stuvsta 772 (130→10), Häggvik 703 (128→12),
-- Sollentuna 67244 (137→54, one bad day from tripping), plus Mölnbo 715 on
-- Nyköpingsbanan in milder form (not excluded). Investigated 2026-07-12:
-- raw_train_announcements shows the IDENTICAL collapse, so this is
-- Trafikverket publishing fewer announcements (planned summer track work /
-- reduced timetable that started 2026-07-11), not our pipeline — the
-- collector is station-agnostic and int matches raw row-for-row.
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
      -- Count only ADVERTISED passenger calls. Null operator (Trafikverket
      -- InformationOwner) = a non-stopping passage, one-sided by
      -- construction. See UNADVERTISED-PASSAGE EXCLUSION above.
      and operator is not null
      -- Replacement buses are Avgang-only by construction, see
      -- REPLACEMENT-BUS EXCLUSION above.
      and not exists (
          select 1
          from unnest(coalesce(deviation, '{}')) as d
          where d like 'Buss%'
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
where larger >= 50
  and (smaller::numeric / nullif(larger, 0)) < 0.10
