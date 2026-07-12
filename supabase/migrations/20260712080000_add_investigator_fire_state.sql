-- Debounce state for the fire-claude-investigator edge function: at most one
-- Claude-investigator routine fire per key per 6 h, so an hourly-failing
-- GitHub Actions workflow wakes ONE agent per incident, not one per run.
-- Service-role written only; RLS enabled with no policies (no client access).
--
-- NB (CLAUDE.md §11 Option A): applied to the live DB via MCP apply_migration
-- on 2026-07-12; this file is the repo record, not a CLI-replayable migration.

create table public.investigator_fire_state (
    fire_key      text primary key,
    last_fired_at timestamptz not null
);

alter table public.investigator_fire_state enable row level security;
