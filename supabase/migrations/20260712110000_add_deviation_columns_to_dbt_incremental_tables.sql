-- Workaround for a dbt-postgres on_schema_change limitation (hit 2026-07-12):
-- sync_all_columns renders array columns as `ADD COLUMN "deviation" ARRAY` —
-- invalid Postgres DDL — so the hourly build errored on int_stop_events as soon
-- as the deviation columns were added to the model SQL (and fct_claimable_journeys
-- would have hit the same on its next build). Pre-adding the columns with the
-- correct types makes dbt's schema comparison find them present, so it generates
-- no ALTER at all. Remember this whenever adding an ARRAY column to any dbt
-- incremental model: ALTER the live table manually first.
--
-- NB (CLAUDE.md §11 Option A): applied to the live DB via MCP apply_migration
-- on 2026-07-12; this file is the repo record, not a CLI-replayable migration.

alter table dbt_dev.int_stop_events
    add column if not exists deviation text[],
    add column if not exists planned_estimated_time timestamptz;

alter table dbt_dev.fct_claimable_journeys
    add column if not exists origin_deviation text[],
    add column if not exists destination_deviation text[],
    add column if not exists has_planned_delay boolean;
