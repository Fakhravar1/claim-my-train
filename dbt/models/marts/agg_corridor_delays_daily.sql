{{ config(
    materialized='incremental',
    unique_key='corridor_day_key',
    incremental_strategy='delete+insert',
    on_schema_change='sync_all_columns',
    pre_hook="{% if is_incremental() %}delete from {{ this }} where service_date < current_date - interval '400 days'{% else %}select 1{% endif %}",
    post_hook="analyze {{ this }}"
) }}

-- agg_corridor_delays_daily
-- CORRIDOR-SCOUTING aggregate (NOT part of the claim pipeline). One row per
-- (hub, direction, counterpart, operator, service_date): daily delay counts for
-- trains seen at a monitored hub station, so we can rank which corridors are worst
-- and decide what to build next (the rollup is agg_corridor_delays).
--
-- Reads stg_train_announcements DIRECTLY (TV-only; both monitored hubs are Swedish),
-- deliberately NOT int_stop_events — this scouting tool is decoupled from the claim
-- chain. Adding/removing a monitored hub here does not touch fct_journeys.
--
-- "Corridor" = the train's terminus labels carried on each TV announcement:
--   * inbound  (arrival at the hub)   -> counterpart = from_location (where it came from)
--   * outbound (departure from the hub) -> counterpart = to_location (where it's headed)
-- from/to are SIGNATURE codes (Hb, Kg, Cst, Dk.kh, ...); the rollup resolves them to
-- names via ref_stations. delay_seconds is the signed deviation at the hub event.
--
-- MATERIALIZATION: incremental TABLE that ACCUMULATES past the raw prune (§13 pattern,
-- mirrors fct_claimable_journeys). stg sees only ~14 d of raw, so every run reprocesses
-- service_date >= current_date - 14 d (delays settle for ~2 h after the train runs) and
-- delete+insert replaces exactly those (corridor, date) keys; older daily rows are never
-- in the batch, so they survive -> "over time" history outlives the 14 d raw horizon.
-- pre_hook caps retention at 400 d (volume is tiny: corridors x days).
--
-- *** --full-refresh collapses history to the ~14 d raw window (same hazard as the other
-- *** accumulating tables, §10). Don't --full-refresh expecting the long history back.

with base as (

    select
        location_signature                                   as hub_signature
        ,advertised_train_ident
        ,event_type
        ,(scheduled at time zone 'Europe/Stockholm')::date   as service_date
        ,case event_type when 'arrival' then 'inbound' else 'outbound' end as direction
        ,case event_type when 'arrival' then from_location else to_location end as counterpart_signature
        ,information_owner                                    as operator   -- brand label users recognise (§15)
        ,delay_seconds
        ,canceled
        ,ingested_at
        ,modified_time
    from {{ ref('stg_train_announcements') }}
    where location_signature in ('Cst', 'Mc')                -- monitored hubs
      and event_type is not null
      and not coalesce(deleted, false)                       -- drop TV retractions
      and (scheduled at time zone 'Europe/Stockholm')::date >= current_date - interval '14 days'

),

-- one row per (train, hub, event_type, day): keep the latest poll (settled actual wins),
-- same late-arriving-fact dedup as int_stop_events so a re-polled train isn't double-counted
deduped as (

    select *
        ,row_number() over (
            partition by advertised_train_ident, hub_signature, event_type, service_date
            order by ingested_at desc, modified_time desc nulls last
        ) as rn
    from base

),

scoped as (

    select *
    from deduped
    where rn = 1
      and counterpart_signature is not null
      and counterpart_signature <> hub_signature             -- drop self-loops / hub-terminating noise

)

select
    {{ dbt_utils.generate_surrogate_key([
        'hub_signature', 'direction', 'counterpart_signature', 'operator', 'service_date'
    ]) }} as corridor_day_key
    ,hub_signature
    ,direction
    ,counterpart_signature
    ,operator
    ,service_date
    ,count(*)                                            as n_services
    ,count(delay_seconds)                                as n_measured        -- denominator for pct_* (NULL delay = no realtime signal)
    ,count(*) filter (where delay_seconds >= 300)        as n_late_5          -- >= 5 min
    ,count(*) filter (where delay_seconds >= 1200)       as n_late_20         -- >= 20 min (claim threshold)
    ,count(*) filter (where canceled)                    as n_cancelled
    ,sum(delay_seconds)                                  as sum_delay_seconds -- over measured rows only
    ,max(delay_seconds)                                  as max_delay_seconds
from scoped
group by hub_signature, direction, counterpart_signature, operator, service_date
