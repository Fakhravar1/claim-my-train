-- Singular data test: catches the "polled but invisible" silent-drop class.
--
-- Context: the TV collector (collect-train-announcements) only returns events for
-- LocationSignatures it explicitly polls, so EVERY signature in raw_train_announcements
-- is one we deliberately asked for. int_stop_events then crosswalks each TV signature to
-- a REST short id via ref_stations, gated to `^740[0-9]{6}$`. If a polled station has no
-- such crosswalk (null rest_area_id, or a non-Swedish/non-740 id), the join SILENTLY DROPS
-- it: the station emits announcements, but it never becomes a journey, never reaches
-- fct_journeys / dim_active_stations / the dropdowns. The Önnestad (`Önd`) gap is the
-- canonical example (§15/§17). This is the single most valuable trust check after adding a
-- new station: if you poll something whose crosswalk is broken, this fails loudly on the
-- next `dbt build` instead of the station quietly never appearing.
--
-- Contract (dbt singular test): zero rows = PASS. Each returned row is a polled signature
-- with no usable crosswalk = a violation.
--
-- KNOWN EXCEPTIONS (documented gaps, excluded so the test passes on healthy data):
--   * Önd (Önnestad)  — null ref_stations.rest_area_id; the only Skåne map station that
--                        never auto-resolved (§15/§17). Resolve via a ResRobot location.name
--                        lookup, then REMOVE it here.
--   * Duo (Duvbo)     — SL pendeltåg stop, null crosswalk (§15). Same treatment.
-- When you resolve one of these, delete it from this list so the test starts guarding it.
-- Do NOT add a new signature here to silence a failure without first checking ref_stations
-- (look up its tv_signature, fix the crosswalk) — the whole point is to surface that gap.
--
-- NO ingested_at FILTER, DELIBERATELY (changed 2026-08-22 with the raw retention cut to
-- 48 h, migration 20260822070000). This test used to scan `now() - interval '2 days'`.
-- Once retention became 48 h that window EQUALLED the retention floor, which §13 warns is
-- the silent-weakening trap: a low-frequency station (Skb, Kbn) may not emit inside a
-- window sized at the floor, so its broken crosswalk would go unflagged and the test would
-- still pass. Scanning the whole retained table is both the WIDEST available station
-- coverage and immune to any future retention change — the prune (pg_cron jobid 12) is the
-- only thing that bounds it. Cost is a seq scan over ~2 days (~139k rows), well under a
-- second. If retention is ever widened a lot, revisit whether an explicit bound is wanted
-- again — but size it BELOW the floor, never at it.

select
    t.location_signature,
    count(*) as announcements_in_retention
from {{ source('raw', 'raw_train_announcements') }} t
left join {{ source('reference', 'ref_stations') }} r
    on  r.tv_signature = t.location_signature
    and r.rest_area_id ~ '^740[0-9]{6}$'
where r.tv_signature is null                       -- no usable 740 crosswalk
  and t.location_signature not in ('Önd', 'Duo')   -- KNOWN EXCEPTIONS, see header
group by t.location_signature
