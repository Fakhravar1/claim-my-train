-- SL Resegaranti payout step (/utbetalning) needs a Swedish bank account:
-- clearing number + account number. Both nullable; "required" only when
-- payout_method='bank' is enforced client-side (same pattern as the other
-- payout fields — no DB CHECK). Lets the SL Shortcut fill the payout page.
--
-- NOTE (§11): applied via the Supabase dashboard / apply_migration, NOT replayed
-- through the CLI. This file is repo documentation of the live change.
alter table public.profiles
  add column if not exists clearing_number text,
  add column if not exists account_number text;
