-- Västtrafik (Göteborg) becomes a purchasing_operator. Its claim form has BankID at the END,
-- so it's filled via the iOS Shortcut (vasttrafik-fill-script) like SL/Skånetrafiken — no
-- in-app filing, no claims row. Extend the profiles.purchasing_operator CHECK to allow it.
--
-- NOTE (§11): applied via apply_migration, NOT replayed through the CLI. Repo documentation.
alter table public.profiles drop constraint if exists profiles_purchasing_operator_check;
alter table public.profiles add constraint profiles_purchasing_operator_check
  check (purchasing_operator = any (array[
    'skanetrafiken','sl','sj','snalltaget','other','oresundstag','hallandstrafiken','vasttrafik'
  ]::text[]));
