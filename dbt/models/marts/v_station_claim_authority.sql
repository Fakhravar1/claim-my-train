{{ config(
    materialized='view',
    schema='public',
    post_hook=[
        "alter view {{ this }} set (security_invoker = on)",
        "grant select on {{ this }} to anon, authenticated"
    ]
) }}

-- v_station_claim_authority
-- Öresundståg origin routing (§1). Öresundståg has NO claim route of its own: a claim
-- goes to the länstrafikbolag of the COUNTY WHERE THE JOURNEY STARTED. This view maps
-- each Swedish station (origin_stop_id) -> that bolag's key, consumed by the frontend
-- (useStationAuthorities -> RegionalClaimModal) only for Öresundståg-resolved journeys.
--
-- One row per Swedish station (740-prefixed crosswalk). county_no is Trafikverket's
-- CountyNo on ref_stations. The key set matches RegionAuthorityKey in the frontend
-- (skanetrafiken / hallandstrafiken / blekingetrafiken / kalmar / kronoberg / vasttrafik).
--
-- Rule source — Öresundståg's own förseningsersättning page:
--   Blekinge -> Blekingetrafiken, Halland -> Hallandstrafiken, Kalmar -> Kalmar länstrafik,
--   Kronoberg -> Länstrafiken Kronoberg, Skåne -> Skånetrafiken, Västra Götaland -> Västtrafik.
--   * "Även för resor från Kungsbacka och Åsa" -> Västtrafik (both are county 13 / Halland
--     geographically, but Kungsbacka kommun buys its trafik from Västtrafik) — STATION-LEVEL
--     exception, overrides the county rule.
--   ** "Även för resor från Köpenhamn" -> Skånetrafiken. Danish stops are REST-side (not in
--     ref_stations' 740 crosswalk), so they never appear here and fall to the frontend's
--     default of skanetrafiken — which is exactly this rule. No row needed.
--
-- Counties outside the Öresundståg map (Stockholm, the SJ trunk, …) resolve to skanetrafiken
-- via the else branch, but that branch is never reached for an actual Öresundståg journey
-- (Öresundståg only runs in the six southern counties above) — it's a harmless default.

with swedish as (
    select
        right(rest_area_id, 6)::int::text as stop_id,
        tv_signature,
        county_no
    from {{ source('reference', 'ref_stations') }}
    where rest_area_id ~ '^740[0-9]{6}$'
)

select
    stop_id,
    case
        -- station-level exceptions (must precede the county rule)
        when tv_signature in ('Kb', 'Åsa') then 'vasttrafik'    -- Kungsbacka, Åsa
        -- county -> länstrafikbolag
        when county_no = 13 then 'hallandstrafiken'  -- Halland
        when county_no = 10 then 'blekingetrafiken'  -- Blekinge
        when county_no = 8  then 'kalmar'            -- Kalmar län
        when county_no = 7  then 'kronoberg'         -- Kronoberg
        when county_no = 14 then 'vasttrafik'        -- Västra Götaland
        else 'skanetrafiken'                         -- Skåne (12) + Köpenhamn + default
    end as region_authority_key
from swedish
