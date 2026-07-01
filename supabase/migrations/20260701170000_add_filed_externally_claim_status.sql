-- 'filed_externally': the user confirmed they submitted a claim on an operator's OWN
-- form (external link-out / iOS Shortcut paths). Terminal from the worker's point of
-- view (never polled — the worker only picks up pending/*_authorized); exists so the
-- journey stops being re-suggested (digest/MyDelays dedupe on claims.journey_key) and
-- shows up in "Mina ansökningar".
--
-- Applied via MCP 2026-07-01. This file is documentation (CLAUDE.md §11 Option A) —
-- do not replay it.
alter table public.claims drop constraint claims_status_check;
alter table public.claims add constraint claims_status_check check (
  status = any (array[
    'pending','generated','submitted','paid','rejected','error',
    'awaiting_sj_authorization','sj_authorized','sj_already_claimed',
    'awaiting_hlt_authorization','hlt_authorized',
    'awaiting_kalmar_authorization','kalmar_authorized',
    'awaiting_vy_authorization','vy_authorized',
    'filed_externally'
  ]::text[])
);
