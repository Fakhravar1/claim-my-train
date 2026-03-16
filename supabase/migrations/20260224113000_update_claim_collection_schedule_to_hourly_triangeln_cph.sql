-- Query claimable corridor windows once per hour for
-- Copenhagen H <-> Malmö Triangeln in both directions.

create or replace function public.trigger_claim_collection()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://jnfwmdirvnqfpfhtipld.supabase.co/functions/v1/get-train-departures',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'mode', 'collect-corridor',
      'direction', 'malmo-departures',
      'originId', '740001554',
      'destinationId', '860000626',
      'timeShiftMinutes', 0
    )
  );

  perform net.http_post(
    url := 'https://jnfwmdirvnqfpfhtipld.supabase.co/functions/v1/get-train-departures',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'mode', 'collect-corridor',
      'direction', 'hyllie-departures',
      'originId', '860000626',
      'destinationId', '740001554',
      'timeShiftMinutes', 0
    )
  );
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname in ('claim-collection-15m', 'claim-collection-hourly-triangeln-cph')
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'claim-collection-hourly-triangeln-cph',
  '0 * * * *',
  $$select public.trigger_claim_collection();$$
);
