with numbered_lines as (

select
    {{ dbt_utils.generate_surrogate_key(['stop__id']) }} as dim_station_id,
    stop__id,
    stop__name as station_name,
    stop__lat,
    stop__lon,
    ingested_at,
    row_number() over (partition by stop__id order by ingested_at desc) as dbt_scd_id
from {{ ref('stg_departures') }}

)


select
    *
from numbered_lines
where dbt_scd_id = 1
