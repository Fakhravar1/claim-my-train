-- Add Arlanda Express (operator "A-train") as a selectable purchasing_operator.
-- EXTERNAL filing path only (link-out to arlandaexpress.se's reklamation form) — no
-- claims row is stored, like SL/Hallandstrafiken. Applied via the dashboard SQL editor;
-- this file is documentation (see CLAUDE.md §11 — migrations are not CLI-replayed).
alter table public.profiles
  drop constraint profiles_purchasing_operator_check,
  add constraint profiles_purchasing_operator_check
  check (purchasing_operator = any (array[
    'skanetrafiken','sl','sj','snalltaget','other','oresundstag',
    'hallandstrafiken','vasttrafik','kalmar','vy','varmlandstrafik',
    'ostgotatrafiken','jlt','ul','malartag','arlandaexpress'
  ]));
