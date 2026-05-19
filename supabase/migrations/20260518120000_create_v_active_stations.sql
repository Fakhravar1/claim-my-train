-- Wrapper view exposing dbt_dev.dim_active_stations to PostgREST (public schema).
-- The view runs as its owner (postgres), so anon/authenticated do NOT need
-- direct USAGE on dbt_dev or SELECT on dim_active_stations.

create or replace view public.v_active_stations as
select
  dim_station_id,
  stop__id,
  station_name,
  stop__lat,
  stop__lon
from dbt_dev.dim_active_stations;

comment on view public.v_active_stations is
  'PostgREST-exposed wrapper over dbt_dev.dim_active_stations. '
  'Lists stations referenced as origin or destination in fct_passenger_journeys.';

grant select on public.v_active_stations to anon, authenticated;
