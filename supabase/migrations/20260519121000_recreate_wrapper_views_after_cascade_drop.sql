-- A dbt run between the prior wrapper-view migration and the decommission migration
-- cascade-dropped public.v_passenger_journeys and public.v_active_stations (CLAUDE.md §10).
-- Recreating them per the recovery SQL in CLAUDE.md §11.

create or replace view public.v_passenger_journeys as
select journey_key, trip__trip_id, trip__start_date,
       origin_stop_id, destination_stop_id,
       origin_stop_name, destination_stop_name,
       origin_scheduled, origin_actual,
       destination_scheduled, destination_actual,
       destination_delay_minutes, is_claimable, canceled,
       route__name, line_terminus, agency__operator
from dbt_dev.fct_passenger_journeys;

create or replace view public.v_active_stations as
select dim_station_id, stop__id, station_name, stop__lat, stop__lon
from dbt_dev.dim_active_stations;

grant select on public.v_passenger_journeys to anon, authenticated;
grant select on public.v_active_stations to anon, authenticated;
