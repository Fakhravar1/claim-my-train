-- Add public.claims.booking_reference — the per-CLAIM booking/ticket number.
--
-- SJ (and other EU 2021/782 web-form operators) key their no-login compensation form
-- on the booking/ticket number of the specific trip, NOT a standing profile field
-- (unlike Skanetrafiken's period-ticket id in profiles.claim_ticket_id). So the user
-- enters it per claim at filing time; buildClaimPayload snapshots it here, and the
-- claim-worker's submit_sj path (§ Phase 4) feeds it into SJ's form.
--
-- Nullable + additive: NULL for the Skanetrafiken PDF path (which reads the ticket id
-- from profiles). Existing claims are unaffected.
--
-- Applied to the live DB via MCP apply_migration on 2026-06-23; this file is the repo
-- record (Option A, CLAUDE.md §11 — not replayed by the CLI).

alter table public.claims
  add column if not exists booking_reference text;

comment on column public.claims.booking_reference is
  'Per-claim booking/ticket number the user attested at filing (e.g. SJ booking ref for the web-form submit). NULL for the Skanetrafiken PDF path. Snapshotted by buildClaimPayload alongside purchasing_operator.';
