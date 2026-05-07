select
    {{ dbt_utils.generate_surrogate_key(['stg.id', 'stg.scheduled']) }} as departure_key,
    s.dim_station_id,
    l.dim_line_id,
    stg.trip__trip_id,
    stg.trip__start_date,
    stg.scheduled,
    stg.realtime,
    stg.arrival_delay,
    stg.canceled,
    stg.is_realtime,
    stg.agency__id,
    stg.ingested_at
from {{ ref('stg_departures') }} stg
left join {{ ref('dim_stations') }} s
    on stg.stop__id = s.stop__id
left join {{ ref('dim_line') }} l
    on stg.route__origin__id = l.route__origin__id
    and stg.route__destination__id = l.route__destination__id
    and stg.route__transport_mode = l.route__transport_mode