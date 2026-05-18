with deduped as (
    select
        trip__trip_id,
        trip__start_date,
        stop__id,
        stop__name,
        route__name,
        route__destination__name,
        agency__name,
        agency__operator,
        scheduled,
        realtime,
        arrival_delay,
        canceled,
        event_type,
        ingested_at,
        row_number() over (
            partition by trip__trip_id, trip__start_date, stop__id, event_type
            order by ingested_at desc
        ) as rn
    from {{ ref('stg_departures') }}
    where is_realtime = true
    and route__transport_mode = 'TRAIN'
)

select
    {{ dbt_utils.generate_surrogate_key([
        'trip__trip_id',
        'trip__start_date',
        'stop__id',
        'event_type'
    ]) }} as departure_key,
    trip__trip_id,
    trip__start_date,
    stop__id,
    stop__name,
    row_number() over ( 
        partition by trip__trip_id, trip__start_date 
        order by scheduled
    ) as stop_sequence,
    route__name,
    route__destination__name,
    agency__name,
    agency__operator,
    scheduled,
    realtime,
    arrival_delay,
    canceled,
    event_type,
    ingested_at
from deduped
where rn = 1