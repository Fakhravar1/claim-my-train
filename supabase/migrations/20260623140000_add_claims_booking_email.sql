-- Add public.claims.booking_email — the per-CLAIM contact (email or mobile) the user
-- attested for an SJ-style web-form claim.
--
-- SJ's no-login form matches on the email/phone used AT PURCHASE, which may differ from
-- the account email. The SJ claim pop-up defaults this field to the account email but lets
-- the user override it; submit_sj feeds it into SJ's form (falling back to profiles.claim_email
-- when NULL). Nullable + additive; NULL for the Skånetrafiken PDF path.
--
-- Applied to the live DB via MCP apply_migration on 2026-06-23; this file is the repo
-- record (Option A, CLAUDE.md §11 — not replayed by the CLI).

alter table public.claims
  add column if not exists booking_email text;

comment on column public.claims.booking_email is
  'Per-claim contact (email or mobile) for an SJ-style web-form claim — the value used at purchase, which SJ matches on. Defaults to the account email in the pop-up; submit_sj prefers this over profiles.claim_email. NULL for the Skånetrafiken PDF path.';
