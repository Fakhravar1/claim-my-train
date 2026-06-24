-- Applied via Supabase MCP/dashboard (CLAUDE.md §11 Option A — recorded here, NOT replayed).
-- Per-station REGIONAL claim authority for Öresundståg routing: a regional (Öresundståg)
-- claim goes to the länstrafikbolag of the ORIGIN county. Maps each active station -> that
-- bolag via ref_stations.county_no. ONLY consulted for regional journeys (the frontend's
-- useStationAuthorities); long-distance (SJ/Snälltåget) authority comes from the operator.
-- Skåne (12), all Danish stops (null, "även för resor från Köpenhamn") and any non-Öresundståg
-- county default to skanetrafiken — the historical in-app path, so no regression.
create or replace view public.v_station_claim_authority as
with ref_county as (
    -- collapse the rare two-signatures-one-rest-id case (Ramlösa, §15) to one county
    select right(rest_area_id, 6)::int as stop_id_int, max(county_no) as county_no
    from public.ref_stations
    where rest_area_id ~ '^740[0-9]{6}$'
    group by 1
)
select
    s.stop__id as stop_id,
    rc.county_no,
    case rc.county_no
        when 13 then 'hallandstrafiken'
        when 10 then 'blekingetrafiken'
        when 8  then 'kalmar'
        when 7  then 'kronoberg'
        when 14 then 'vasttrafik'
        else 'skanetrafiken'   -- 12 Skåne + Danish(null) + SJ-trunk counties
    end as region_authority_key
from public.v_active_stations s
left join ref_county rc on rc.stop_id_int = s.stop__id::int;

grant select on public.v_station_claim_authority to anon, authenticated;
