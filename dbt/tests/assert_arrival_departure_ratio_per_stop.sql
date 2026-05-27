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
-- Why 0.10 and not 0.30: the corridor includes legitimate termini (København H
-- for southbound Pågatåg, Malmö C for many lines) where one side can be
-- modestly skewed. 0.10 is loose enough not to false-alarm but tight enough
-- that the Triangeln collapse (0.006) would have triggered immediately.

with daily_counts as (
    select
        stop__id,
        stop__name,
        trip__start_date,
        count(*) filter (where event_type = 'arrival')   as arrival_count,
        count(*) filter (where event_type = 'departure') as departure_count
    from {{ ref('fct_departures') }}
    where trip__start_date::date = current_date - 1
    group by 1, 2, 3
),

ratios as (
    select
        stop__id,
        stop__name,
        trip__start_date,
        arrival_count,
        departure_count,
        greatest(arrival_count, departure_count) as larger,
        least(arrival_count, departure_count)    as smaller
    from daily_counts
)

select
    stop__id,
    stop__name,
    trip__start_date,
    arrival_count,
    departure_count,
    round(smaller::numeric / nullif(larger, 0), 3) as ratio
from ratios
where larger >= 100
  and (smaller::numeric / nullif(larger, 0)) < 0.10
