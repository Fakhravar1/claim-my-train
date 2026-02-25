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
    body := '{"mode":"collect-corridor","timeShiftMinutes":0}'::jsonb
  );
end;
$$;

