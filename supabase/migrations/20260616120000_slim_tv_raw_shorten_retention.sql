-- 2026-06-16  Capacity re-tune for the full-Skåne-network TV expansion (§15)
-- ---------------------------------------------------------------------------
-- DOCUMENTATION ONLY — already applied live via the Supabase SQL path (§11);
-- these statements are NOT replayed by the CLI and would error (objects exist).
--
-- Goal: make the ~80-station Skåne train network fit the 500 MB free-tier
-- ceiling. Three levers:
--   (1) Stop storing the TV `raw` jsonb (collector collect-train-announcements
--       v11) — ~1.4 kB of the ~1.65 kB/row, and nothing downstream reads it
--       (stg_train_announcements uses only the typed columns). Edge-function
--       change, recorded here for honesty; not SQL.
--   (2) Shorten TV raw retention 14 d -> 5 d. Raw is only a buffer; the
--       conformed history lives in int_stop_events. 5 d >> the int 6 h
--       incremental lookback + realistic dbt-build stalls.
--   (3) Shorten int_stop_events retention 90 d -> 7 d. The durable CLAIM set
--       lives in fct_claimable_journeys (90 d, captured incrementally), so the
--       conformed layer does not need 90 d. Verified before applying: 0
--       claimables in the 7–90 d window were uncaptured in fct_claimable_journeys.
--       Consequence: the departures board history is now 7 d; claim filing
--       (reads v_claimable_journeys) keeps the full 90 d.

-- (2) TV raw prune: 14 d -> 5 d  (cron jobid 10 -> 12)
select cron.unschedule(10);
select cron.schedule('prune-raw-train-announcements-5d', '45 3 * * *',
  $$delete from public.raw_train_announcements where ingested_at < now() - interval '5 days'$$);

-- (3) int_stop_events prune: 90 d -> 7 d  (cron jobid 11 -> 13)
select cron.unschedule(11);
select cron.schedule('prune-int-stop-events-7d', '50 3 * * *',
  $$delete from dbt_dev.int_stop_events where service_date < current_date - interval '7 days'$$);

-- applied the new int retention immediately (cron would otherwise wait for 03:50)
delete from dbt_dev.int_stop_events where service_date < current_date - interval '7 days';
