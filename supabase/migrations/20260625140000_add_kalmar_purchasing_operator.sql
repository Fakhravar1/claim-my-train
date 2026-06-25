-- Kalmar länstrafik (KLT) becomes a purchasing_operator. Same `respons` ASP.NET web form
-- as Hallandstrafiken (no BankID), filed headlessly by the claim-worker (submit_kalmar.py).
-- Extend the profiles.purchasing_operator CHECK to allow it.
--
-- NOTE (§11): applied via apply_migration, NOT replayed through the CLI. Repo documentation.
alter table public.profiles drop constraint if exists profiles_purchasing_operator_check;
alter table public.profiles add constraint profiles_purchasing_operator_check
  check (purchasing_operator = any (array[
    'skanetrafiken','sl','sj','snalltaget','other','oresundstag','hallandstrafiken','vasttrafik','kalmar'
  ]::text[]));
