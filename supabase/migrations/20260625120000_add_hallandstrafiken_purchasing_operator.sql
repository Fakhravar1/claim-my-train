-- Hallandstrafiken becomes a first-class purchasing_operator: it files in-app via the
-- headless claim-worker (submit_hallandstrafiken.py — no BankID, so server-side submission
-- works). Extend the profiles.purchasing_operator CHECK to allow it.
--
-- NOTE (§11): applied via apply_migration, NOT replayed through the CLI. Repo documentation.
alter table public.profiles drop constraint if exists profiles_purchasing_operator_check;
alter table public.profiles add constraint profiles_purchasing_operator_check
  check (purchasing_operator = any (array[
    'skanetrafiken','sl','sj','snalltaget','other','oresundstag','hallandstrafiken'
  ]::text[]));
