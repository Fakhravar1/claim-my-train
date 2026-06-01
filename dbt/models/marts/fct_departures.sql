{{ config(
    materialized='incremental',
    unique_key='departure_key',
    incremental_strategy='delete+insert',
    on_schema_change='sync_all_columns',
    indexes=[
      {'columns': ['trip__trip_id', 'trip__start_date', 'event_type', 'stop_sequence']},
      {'columns': ['event_type', 'stop__id']}
    ]
) }}

with source as (
    select * from {{ ref('stg_departures') }}
    {% if is_incremental() %}
    -- incremental unit is the TRIP, not the row: stop_sequence ranks across the
    -- whole trip, so pull every stop of any trip touched since the last build
    where (trip__trip_id, trip__start_date) in (
        select distinct trip__trip_id, trip__start_date
        from {{ ref('stg_departures') }}
        where ingested_at >= (select max(ingested_at) from {{ this }}) - interval '1 hour'
    )
    {% endif %}
),

deduped as (
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
    from source
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