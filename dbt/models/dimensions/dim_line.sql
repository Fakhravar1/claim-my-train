with numbered_lines as (
select 
    {{ dbt_utils.generate_surrogate_key(['route__origin__id', 'route__destination__id', 'route__transport_mode']) }} as dim_line_id,
    route__origin__id,
    route__origin__name,
    route__destination__id,
    route__destination__name,
    route__direction,
    route__transport_mode,
    route__transport_mode_code,
    route__name,
    route__designation,
    row_number() over (
      partition by route__origin__id, route__destination__id, route__transport_mode 
      order by ingested_at desc
    ) as dbt_scd_id
from {{ ref('stg_departures') }}
) 
select
    *
from numbered_lines
where dbt_scd_id = 1

