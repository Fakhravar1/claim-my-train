-- 2026-08-22 — Storage-pressure levers 1 + 2 from the CLAUDE.md §13 playbook.
--
-- Context: DB measured 390 MB / 500 MB (78%) on 2026-08-22. The three churn
-- tables were 87% of it. §13 ranks the levers; these are the two that cost
-- nothing in product capability. int_stop_events retention was deliberately
-- LEFT AT 5 DAYS — §13 Lever 3 is load-bearing for the board, the station
-- dropdowns, and the claimable layer's ±1 day pairing slop.
--
-- Applied live via the SQL path (§11 Option A: the live database is the source
-- of truth; this file is the repo's honest record and is NOT replayed).
--
-- ---------------------------------------------------------------------------
-- LEVER 1 (refined) — idx_rta_station_sched: 15 MB -> 192 kB
-- ---------------------------------------------------------------------------
-- §13 proposed DROPPING this index outright ("a seq scan over 3 days is
-- cheap"). Measured first, per the §5 "diagnose with explain before changing
-- materialization" rule — and the drop was NOT free:
--
--   plan                         exec       buffers
--   bitmap via full index      1527 ms   hit 903  read 678
--   forced seq scan            1946 ms   hit 2062 read 4987   (4.5x the I/O)
--   bitmap via PARTIAL index     26 ms   hit 1483 read  35    <- shipped
--
-- The only caller is agg_corridor_delays_daily, which filters
-- `location_signature in ('Cst','Mc')` — 6,448 of 230k rows (2.8%). So the
-- index does not need to cover the other ~452 signatures. A partial index
-- keeps the access path and reclaims 98.7% of the size. It runs 96x/day (the
-- */15 dbt cadence), so the extra 5.5k buffer reads of a seq scan would have
-- been real page-cache pressure on a free-tier instance, not just wall time.
--
-- ⚠️ COUPLING: the partial predicate MUST match the hub list in
-- dbt/models/marts/agg_corridor_delays_daily.sql. Adding a monitored hub there
-- without adding it here silently drops that hub back to a seq scan. A comment
-- in the model points back at this migration.

create index if not exists idx_rta_station_sched_hubs
    on public.raw_train_announcements (location_signature, scheduled_time)
    where location_signature in ('Cst', 'Mc');

drop index if exists public.idx_rta_station_sched;

-- ---------------------------------------------------------------------------
-- LEVER 2 — raw_train_announcements retention 3 d -> 48 h (~40 MB)
-- ---------------------------------------------------------------------------
-- Conformed history lives in int_stop_events, so this raw buffer only has to
-- outlast the int incremental lookback (6 h) plus tolerance for a dbt-build
-- stall. What it actually buys is OUTAGE TOLERANCE, and that drops from
-- 72–96 h to 48–72 h. Past it, raw is pruned before int ingests it =
-- permanent, unrecoverable loss (TV live retention is ~2 d; it cannot be
-- refetched).
--
-- Safe because int_stop_events' incremental filter has NO UPPER BOUND
-- (`ingested_at >= max(ingested_at) - interval '6 hours'`, int_stop_events.sql
-- L102/L140) — a long outage causes no filter gap, it drains the whole backlog
-- on recovery. Only existence matters. The §10 watchdog alerts on tv_raw at
-- 90 min, far inside the window.
--
-- ⚠️ A daily prune at interval N gives N to 2N of retention (§13), so the
-- FLOOR is 48 h and the span oscillates 48 -> 72 h. Size every dependent
-- window off the 48 h floor, never the average.

select cron.alter_job(
    12,
    command => $$delete from public.raw_train_announcements where ingested_at < now() - interval '2 days'$$
);

-- Realise it immediately rather than waiting for 03:45 UTC (139,477 rows).
-- NB a plain DELETE never returns space to the OS (§10) — the heap plateaus
-- smaller as it churns, and the indexes shrink at the next REINDEX.
delete from public.raw_train_announcements where ingested_at < now() - interval '2 days';

-- ---------------------------------------------------------------------------
-- REQUIRED COMPANION CHANGE (not DDL — see the same commit)
-- ---------------------------------------------------------------------------
-- dbt/tests/assert_polled_stations_have_crosswalk.sql filtered on
-- `ingested_at >= now() - interval '2 days'` — a window that now EQUALS the
-- retention floor. §13 flags this exact trap: it would not error, it would
-- SILENTLY WEAKEN (a low-frequency station like Skb/Kbn might not emit inside
-- the window, so a broken crosswalk goes unflagged). The filter was removed
-- entirely so the test scans whatever is retained: maximum station coverage,
-- and no window/retention coupling left to drift.
