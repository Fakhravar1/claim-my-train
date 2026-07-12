-- stg_train_announcements
-- Clean + cast + normalise Trafikverket TrainAnnouncement rows onto the
-- conformed stop-event vocabulary used by stg_departures (REST).
-- NO joins (repo convention, §5): the LocationSignature -> 740... crosswalk
-- via ref_stations and the train-number match to REST live in the intermediate
-- conforming layer, not here. Staging only normalises shape.

select
  activity_id                                                              -- TV natural key (upsert key); 1 row per announcement already
  ,advertised_train_ident                                                  -- train number -> joins REST trip__technical_number in the int layer
  ,location_signature                                                      -- TV station code -> crosswalked to 740... in the int layer

  ,case activity_type
     when 'Ankomst' then 'arrival'
     when 'Avgang'  then 'departure'
   end                                                  as event_type      -- match stg_departures vocabulary exactly

  ,scheduled_time                                       as scheduled
  ,coalesce(actual_time, estimated_time)               as realtime         -- realised time if settled, else current prediction
  ,extract(epoch from (coalesce(actual_time, estimated_time) - scheduled_time))::int
                                                        as delay_seconds    -- signed event deviation; NULL when no realtime signal yet
  ,(actual_time is not null)                            as is_realized      -- true once the event physically happened (TV measures track)

  ,canceled
  ,deleted                                                                  -- TV retraction flag; kept, NOT filtered (no row-dropping in staging)

  ,deviation                                                                -- Trafikverket Deviation descriptions ("Banarbete", "Buss ersätter", ...);
                                                                            -- the maintenance-work signal. Collector v23+; NULL before 2026-07-12.
  ,planned_estimated_time                                                   -- delay known IN ADVANCE (planned disruption) — 72h-rule groundwork.
                                                                            -- Distinct from estimated_time, which is the realtime prediction.

  ,operator                                                                 -- descriptive only — never a join/rule key (§5, §8)
  ,train_owner                                                              -- flips at contract seams (e.g. Malmö C); descriptive only
  ,information_owner
  ,from_location
  ,to_location
  ,via_from_location
  ,track_at_location

  ,modified_time
  ,ingested_at

from {{ source('raw', 'raw_train_announcements') }}
