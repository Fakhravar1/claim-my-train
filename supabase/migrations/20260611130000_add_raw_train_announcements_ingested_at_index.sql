-- Btree on ingested_at so int_stop_events' incremental lookback filter
-- (ingested_at >= watermark - 6h) is index-scannable instead of a seq scan.
-- Mirrors the 20260601 index on raw_departures for the same reason.
--
-- NOTE (§11): applied via MCP apply_migration on 2026-06-11. This file is
-- documentation of the live state, not replayed by the CLI.
create index if not exists idx_raw_train_announcements_ingested_at
    on public.raw_train_announcements (ingested_at);
