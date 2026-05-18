{{ config(materialized='view') }}

select
    origin.trip__trip_id,
    origin.trip__start_date,

    origin.stop__id      as origin_stop_id,
    origin.stop__name    as origin_stop_name,
    origin.scheduled     as origin_scheduled,
    origin.stop_sequence as origin_sequence,

    dest.stop__id        as destination_stop_id,
    dest.stop__name      as destination_stop_name,
    dest.scheduled       as destination_scheduled,
    dest.realtime        as destination_actual_arrival,
    dest.stop_sequence   as destination_sequence,

    dest.arrival_delay                  as delay_seconds,
    round(dest.arrival_delay / 60.0, 1) as delay_minutes,
 
    origin.arrival_delay                                            as origin_delay_seconds,
    dest.arrival_delay                                              as destination_delay_seconds,
    (dest.arrival_delay - origin.arrival_delay)                     as passenger_delay_seconds,
    round((dest.arrival_delay - origin.arrival_delay) / 60.0, 1)    as passenger_delay_minutes,
    ((dest.arrival_delay - origin.arrival_delay) >= 1200)           as is_claimable,
    dest.canceled,

    origin.route__name,
    origin.route__destination__name as line_terminus,
    origin.agency__operator

from {{ ref('fct_departures') }} origin
join {{ ref('fct_departures') }} dest
    on  origin.trip__trip_id    = dest.trip__trip_id
    and origin.trip__start_date = dest.trip__start_date
    and origin.stop_sequence    < dest.stop_sequence