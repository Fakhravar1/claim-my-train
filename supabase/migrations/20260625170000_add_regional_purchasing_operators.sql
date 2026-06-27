-- Add 5 regional länstrafik operators to profiles.purchasing_operator.
-- These file EXTERNALLY for now (the claim CTA links out to each operator's own
-- förseningsersättning form via ShortcutClaimModal, no claims row); headless filing is a
-- follow-up, reconned per form (§19). UL has no journey operator label (its trains run as
-- Mälardalstrafik AB / X-trafik) so it is manual-select only; Mälartåg = 'Mälardalstrafik AB'.
--
-- Applied via the dashboard SQL editor (the CLI db push path is knowingly broken, §11);
-- this file is the repo record, not replayed.

alter table public.profiles drop constraint if exists profiles_purchasing_operator_check;
alter table public.profiles add constraint profiles_purchasing_operator_check
  check (purchasing_operator in (
    'skanetrafiken','sl','sj','snalltaget','other','oresundstag','hallandstrafiken',
    'vasttrafik','kalmar','vy','varmlandstrafik','ostgotatrafiken','jlt','ul','malartag'
  ));
