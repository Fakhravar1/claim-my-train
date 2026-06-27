-- Vy (Vy Tåg) becomes a purchasing_operator. Vy handles förseningsersättning on its own
-- reimbursement portal (https://prod-reimbursement-swe-web.azurewebsites.net/complaint-ticket/vytag),
-- so it is EXTERNAL: the claim CTA links out to Vy's form and no claims row is stored
-- (the SL/Hallandstrafiken pattern). Extend the profiles.purchasing_operator CHECK to allow it.
--
-- NOTE (§11): applied via apply_migration, NOT replayed through the CLI. Repo documentation.
alter table public.profiles drop constraint if exists profiles_purchasing_operator_check;
alter table public.profiles add constraint profiles_purchasing_operator_check
  check (purchasing_operator = any (array[
    'skanetrafiken','sl','sj','snalltaget','other','oresundstag','hallandstrafiken','vasttrafik','kalmar','vy'
  ]::text[]));
