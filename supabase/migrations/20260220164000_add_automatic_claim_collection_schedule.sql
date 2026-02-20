-- Run claim collection automatically every 15 minutes, independent of active users.
-- This uses pg_cron + pg_net to invoke the deployed edge function for both directions.

create extension if not exists pg_net;
create extension if not exists pg_cron;

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
    body := '{"direction":"malmo-departures","timeShiftMinutes":0}'::jsonb
  );

  perform net.http_post(
    url := 'https://jnfwmdirvnqfpfhtipld.supabase.co/functions/v1/get-train-departures',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"direction":"hyllie-departures","timeShiftMinutes":0}'::jsonb
  );
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'claim-collection-15m'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'claim-collection-15m',
  '*/15 * * * *',
  $$select public.trigger_claim_collection();$$
);
