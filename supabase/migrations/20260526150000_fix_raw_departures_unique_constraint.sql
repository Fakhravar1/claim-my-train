-- Fix latent upsert-collision bug in raw_departures ingestion.
--
-- Background: the collect-raw-departures edge function fetches /departures and
-- /arrivals from Trafiklab for each corridor stop, then does ONE upsert with
-- ignoreDuplicates=true. The existing unique constraint omits event_type:
--   UNIQUE (trip__trip_id, trip__start_date, stop__id, scheduled, ingested_at)
-- For intermediate stops where Trafiklab returns identical `scheduled` for the
-- arrival and departure of the same trip (instantaneous pass-through, e.g.
-- Malmö Triangeln), the arrival row collides with the departure row already in
-- the batch and is silently dropped. Triangeln arrivals collapsed from ~1700
-- trips/day (pre-2026-05-19) to ~10-30/day after Trafiklab tightened arrival
-- and departure scheduled times to match. Departures are pushed first in the
-- batch, so arrivals always lose the conflict.
--
-- Fix: include event_type in the unique constraint so both rows survive.
-- Backfill is not possible — Trafiklab's realtime feed serves a short window.

alter table public.raw_departures
  drop constraint if exists raw_departures_trip__trip_id_trip__start_date_stop__id_sche_key;

alter table public.raw_departures
  add constraint raw_departures_unique_event
  unique (trip__trip_id, trip__start_date, stop__id, scheduled, ingested_at, event_type);
