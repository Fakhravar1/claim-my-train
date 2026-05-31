-- Claim-identity fields added to profiles for the Skånetrafiken reklamation.
-- Applied via the Supabase SQL editor during the 2026-05-29/30 session;
-- recorded here so a fresh rebuild from migrations reproduces them.
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists payout_method text
    check (payout_method is null or payout_method in ('bank', 'sms', 'email'));
