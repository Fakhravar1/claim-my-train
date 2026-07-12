-- Maintenance-work signal (step 1 of the 72h-rule groundwork): store the
-- Deviation descriptions ("Banarbete", "Buss ersätter", ...) and the
-- planned-in-advance delay estimate (PlannedEstimatedTimeAtLocation) that
-- Trafikverket already sends but the collector (≤v22) discarded. Collector
-- v23 populates them; stg_train_announcements → int_stop_events →
-- fct_journeys carry them as descriptive context (never a rule key, §5/§8).
--
-- NB (CLAUDE.md §11 Option A): applied to the live DB via MCP apply_migration
-- on 2026-07-12; this file is the repo record, not a CLI-replayable migration.

alter table public.raw_train_announcements
    add column deviation text[],
    add column planned_estimated_time timestamptz;
