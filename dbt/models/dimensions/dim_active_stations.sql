{{ config(materialized='table') }}

select distinct s.*
from {{ ref('dim_stations') }} s
where exists (
  select 1
  from {{ ref('fct_journeys') }} j
  where j.origin_stop_id = s.stop__id
     or j.destination_stop_id = s.stop__id
)