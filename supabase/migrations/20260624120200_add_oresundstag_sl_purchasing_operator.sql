-- Applied via Supabase MCP/dashboard (CLAUDE.md §11 Option A — recorded here, NOT replayed).
-- Adds 'oresundstag' (origin-routed regional claims) and 'sl' (the frontend already offered
-- it but the live CHECK was missing it — saving sl would have failed) to the allowed
-- profiles.purchasing_operator values.
alter table public.profiles drop constraint if exists profiles_purchasing_operator_check;
alter table public.profiles add constraint profiles_purchasing_operator_check
  check (purchasing_operator = any (array['skanetrafiken','sl','sj','snalltaget','other','oresundstag']::text[]));
