-- Retire fct_departures: consumer-less since the claim-retention layer moved to
-- fct_journeys (2026-06-11). 51 MB / ~10% of the free-tier ceiling reclaimed.
-- Model file deleted, so dbt will not recreate it.
--
-- NOTE (§11): applied via MCP apply_migration on 2026-06-13. This file is
-- documentation of the live state, not replayed by the CLI.
drop table if exists dbt_dev.fct_departures;

-- Prune the two remaining unbounded growers.
-- raw_train_announcements: short ingestion buffer (14 d) — the conformed history
-- lives in int_stop_events, which accumulates independently. 14 d comfortably
-- covers the 6 h incremental lookback + dbt-build gaps; it is the ONLY TV archive,
-- so kept a touch longer than raw_departures' 10 d.
select cron.schedule(
  'prune-raw-train-announcements-14d',
  '45 3 * * *',
  $$ delete from public.raw_train_announcements where ingested_at < now() - interval '14 days' $$
);

-- int_stop_events: bound at 90 d (the claim window; also covers the departures
-- board's 60-day date picker). The 90-day claimable table is captured
-- independently, so this prune never affects claim filing.
select cron.schedule(
  'prune-int-stop-events-90d',
  '50 3 * * *',
  $$ delete from dbt_dev.int_stop_events where service_date < current_date - interval '90 days' $$
);
