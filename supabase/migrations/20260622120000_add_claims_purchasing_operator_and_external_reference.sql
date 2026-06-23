-- Add operator routing + external confirmation columns to public.claims.
--
-- purchasing_operator: snapshotted from profiles.purchasing_operator at filing
--   time (buildClaimPayload). The claim-worker routes on THIS value, not the live
--   profile, so a later profile change can't re-route an already-filed claim:
--     skanetrafiken -> fill the reklamation PDF (existing path)
--     sl            -> POST to SL's no-BankID web form (submit_sl)
-- external_reference: the confirmation / case id the operator returns on submit
--   (e.g. SL's web-form receipt). NULL for the PDF path.
--
-- Both nullable + additive; existing Skanetrafiken claims are unaffected
-- (purchasing_operator backfills to NULL → the worker treats NULL as skanetrafiken
-- for backward compatibility).
--
-- Applied to the live DB via MCP apply_migration on 2026-06-22; this file is the
-- repo record (Option A, CLAUDE.md §11 — not replayed by the CLI).

alter table public.claims
  add column if not exists purchasing_operator text,
  add column if not exists external_reference text;

comment on column public.claims.purchasing_operator is
  'Operator/vendor the user attested at filing time (skanetrafiken | sl | ...). Routes the worker: skanetrafiken -> PDF fill, sl -> SL web-form POST. Snapshotted from profiles.purchasing_operator at filing so a later profile change cannot re-route an already-filed claim.';
comment on column public.claims.external_reference is
  'Confirmation / case id returned by the operator on submission (e.g. SL web-form receipt). NULL for the Skanetrafiken PDF path.';
