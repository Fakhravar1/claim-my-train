-- Fix stale claims_status_check.
--
-- The old constraint only allowed pending/generated/submitted/paid/rejected/error, which
-- rejected every status the headless-operator worker writes for the SJ/Kalmar/Vy/HLT
-- authorize flow. A live Kalmar claim already failed with 23514 when the worker tried to
-- set 'awaiting_kalmar_authorization'. Widen to the full worker vocabulary.
--
-- Status values are sourced directly from claim-worker/worker.py:
--   handle_sj              -> awaiting_sj_authorization | sj_already_claimed | submitted | error
--   handle_hallandstrafiken-> awaiting_hlt_authorization | submitted | error
--   handle_kalmar          -> awaiting_kalmar_authorization | submitted | error
--   handle_vy              -> awaiting_vy_authorization | submitted | error
-- and the poll filter reads the frontend-written authorize statuses:
--   pending, sj_authorized, hlt_authorized, kalmar_authorized, vy_authorized
--
-- NB (repo-honesty): recorded per CLAUDE.md §11 Option A. Applied via the Supabase MCP
-- apply_migration (remote), not replayed via the CLI.

alter table public.claims drop constraint claims_status_check;

alter table public.claims add constraint claims_status_check
  check (status = any (array[
    -- lifecycle + legacy
    'pending','generated','submitted','paid','rejected','error',
    -- SJ (submit_sj)
    'awaiting_sj_authorization','sj_authorized','sj_already_claimed',
    -- Hallandstrafiken (submit_hallandstrafiken)
    'awaiting_hlt_authorization','hlt_authorized',
    -- Kalmar (submit_kalmar)
    'awaiting_kalmar_authorization','kalmar_authorized',
    -- Vy (submit_vy)
    'awaiting_vy_authorization','vy_authorized'
  ]::text[]));
