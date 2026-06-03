-- Unschedule first if it exists, so this migration is safe to re-run.
select cron.unschedule('prune-raw-departures-10d')
where exists (select 1 from cron.job where jobname = 'prune-raw-departures-10d');

select cron.schedule(
  'prune-raw-departures-10d',
  '30 3 * * *',                                  -- 03:30 daily, off-peak vs the 15-min ingest
  $$ delete from public.raw_departures
     where ingested_at < now() - interval '10 days' $$
);