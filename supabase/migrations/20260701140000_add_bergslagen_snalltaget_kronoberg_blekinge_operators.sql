-- Add four more selectable purchasing_operators, all EXTERNAL link-out paths (no claims
-- row): tagibergslagen, tagab, kronoberg, blekingetrafiken. Closes the coverage gaps for
-- operators that appear on the board but had no way to file (Tåg i Bergslagen surfaced by
-- the Närke+Västmanland fill; Kronoberg/Blekingetrafiken were only reachable via Öresundståg
-- origin-routing, not as a directly-bought ticket). `snalltaget` already exists in the CHECK
-- (was inert) — it just gets a PURCHASING_OPERATORS entry in the frontend, no DDL needed.
-- Applied via the dashboard SQL editor; this file is documentation (CLAUDE.md §11).
alter table public.profiles
  drop constraint profiles_purchasing_operator_check,
  add constraint profiles_purchasing_operator_check
  check (purchasing_operator = any (array[
    'skanetrafiken','sl','sj','snalltaget','other','oresundstag',
    'hallandstrafiken','vasttrafik','kalmar','vy','varmlandstrafik',
    'ostgotatrafiken','jlt','ul','malartag','arlandaexpress',
    'tagibergslagen','tagab','kronoberg','blekingetrafiken'
  ]));
