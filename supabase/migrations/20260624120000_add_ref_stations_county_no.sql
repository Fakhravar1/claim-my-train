-- Applied via Supabase MCP/dashboard (CLAUDE.md §11 Option A — recorded here for repo
-- honesty, NOT replayed by the CLI). Adds the county a station sits in, used for
-- Öresundståg claim-authority routing. Populated from Trafikverket TrainStation.CountyNo
-- (via the one-off tmp-county-lookup edge function).
alter table public.ref_stations add column if not exists county_no smallint;
comment on column public.ref_stations.county_no is 'Trafikverket CountyNo (primary county number) — the län the station sits in. Drives Öresundståg claim-authority routing: the länstrafikbolag of the ORIGIN county owns a regional claim. Populated from Trafikverket TrainStation.CountyNo.';
