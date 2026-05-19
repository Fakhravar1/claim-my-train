-- Wrapper view exposing dbt_dev.fct_passenger_journeys to PostgREST (public schema).
-- Drops origin_sequence, destination_sequence, destination_delay_seconds (internal grain detail).

create or replace view public.v_passenger_journeys as
select
  journey_key,
  trip__trip_id,
  trip__start_date,
  origin_stop_id,
  destination_stop_id,
  origin_stop_name,
  destination_stop_name,
  origin_scheduled,
  origin_actual,
  destination_scheduled,
  destination_actual,
  destination_delay_minutes,
  is_claimable,
  canceled,
  route__name,
  line_terminus,
  agency__operator
from dbt_dev.fct_passenger_journeys;

comment on view public.v_passenger_journeys is
  'PostgREST-exposed wrapper over dbt_dev.fct_passenger_journeys (journey-leg grain). '
  'Drops origin_sequence, destination_sequence, destination_delay_seconds (internal).';

grant select on public.v_passenger_journeys to anon, authenticated;

-- One-time data migration: translate existing profile stop IDs from Trafiklab sams-id
-- to GTFS so the new Settings dropdowns (driven by dim_active_stations) match saved values.
update public.profiles
set
  commuter_from_stop_id = case commuter_from_stop_id
    when '740000003' then '3'
    when '740001554' then '1587'
    when '740001586' then '1586'
    when '860000284' then '25314'
    when '860000322' then '23657'
    when '860000501' then '25313'
    when '860000626' then '25315'
    else commuter_from_stop_id
  end,
  commuter_to_stop_id = case commuter_to_stop_id
    when '740000003' then '3'
    when '740001554' then '1587'
    when '740001586' then '1586'
    when '860000284' then '25314'
    when '860000322' then '23657'
    when '860000501' then '25313'
    when '860000626' then '25315'
    else commuter_to_stop_id
  end,
  preferred_from_stop_id = case preferred_from_stop_id
    when '740000003' then '3'
    when '740001554' then '1587'
    when '740001586' then '1586'
    when '860000284' then '25314'
    when '860000322' then '23657'
    when '860000501' then '25313'
    when '860000626' then '25315'
    else preferred_from_stop_id
  end,
  preferred_to_stop_id = case preferred_to_stop_id
    when '740000003' then '3'
    when '740001554' then '1587'
    when '740001586' then '1586'
    when '860000284' then '25314'
    when '860000322' then '23657'
    when '860000501' then '25313'
    when '860000626' then '25315'
    else preferred_to_stop_id
  end
where
     commuter_from_stop_id like '7%' or commuter_from_stop_id like '8%'
  or commuter_to_stop_id   like '7%' or commuter_to_stop_id   like '8%'
  or preferred_from_stop_id like '7%' or preferred_from_stop_id like '8%'
  or preferred_to_stop_id   like '7%' or preferred_to_stop_id   like '8%';
