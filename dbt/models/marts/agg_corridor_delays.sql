{{ config(materialized='view') }}

-- agg_corridor_delays
-- The corridor-scouting RANKING the user reads (internal; dbt_dev, no public wrapper).
-- Rolls agg_corridor_delays_daily up across ALL retained days per
-- (hub, direction, counterpart, operator) and resolves the signature codes to human
-- station names via ref_stations. Ranked worst-first by count of 20+ min delays.
--
-- Read it:  select * from dbt_dev.agg_corridor_delays order by n_late_20 desc limit 20;
--
-- Names: ref_stations is Swedish-only (740... crosswalk), so Danish counterparts
-- (Dk.kh, Dk.cph, ...) won't resolve -> we fall back to the raw signature code.
-- pct_* denominators: pct_late_* over measured services (NULL-delay rows excluded);
-- pct_cancelled over all services.

with rolled as (

    select
        hub_signature
        ,direction
        ,counterpart_signature
        ,operator
        ,min(service_date)                  as first_seen_date
        ,max(service_date)                  as last_seen_date
        ,count(distinct service_date)       as n_days
        ,sum(n_services)                    as total_services
        ,sum(n_measured)                    as total_measured
        ,sum(n_late_5)                      as n_late_5
        ,sum(n_late_20)                     as n_late_20
        ,sum(n_cancelled)                   as n_cancelled
        ,sum(sum_delay_seconds)             as sum_delay_seconds
        ,max(max_delay_seconds)             as max_delay_seconds
    from {{ ref('agg_corridor_delays_daily') }}
    group by hub_signature, direction, counterpart_signature, operator

)

select
    coalesce(h.station_name, r.hub_signature)            as hub_name
    ,r.direction
    ,coalesce(c.station_name, r.counterpart_signature)   as counterpart_name
    ,r.operator
    ,r.hub_signature
    ,r.counterpart_signature
    ,r.first_seen_date
    ,r.last_seen_date
    ,r.n_days
    ,r.total_services
    ,r.total_measured
    ,r.n_late_5
    ,round(100.0 * r.n_late_5  / nullif(r.total_measured, 0), 1)  as pct_late_5
    ,r.n_late_20
    ,round(100.0 * r.n_late_20 / nullif(r.total_measured, 0), 1)  as pct_late_20
    ,r.n_cancelled
    ,round(100.0 * r.n_cancelled / nullif(r.total_services, 0), 1) as pct_cancelled
    ,round(r.sum_delay_seconds / nullif(r.total_measured, 0) / 60.0, 1) as avg_delay_min
    ,round(r.max_delay_seconds / 60.0, 1)                as max_delay_min
from rolled r
left join {{ source('reference', 'ref_stations') }} h on h.tv_signature = r.hub_signature
left join {{ source('reference', 'ref_stations') }} c on c.tv_signature = r.counterpart_signature
order by r.n_late_20 desc, pct_late_20 desc
