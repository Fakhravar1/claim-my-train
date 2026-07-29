-- Phase 2 of the Raspberry Pi runner plan (docs/pi-runner-plan.md §3).
-- Applied via the Supabase SQL API on 2026-07-29; this file is the repo's record
-- of it, not a replayable script (CLAUDE.md §11 — the live DB is the source of
-- truth and the CLI migration history is knowingly drifted).
--
-- Replaces the external cron-jobs.org trigger for dbt-run with an in-Supabase
-- one that routes through the dispatch-workflow edge function. That function
-- probes whether the self-hosted `qvitta-pi` runner is online and picks the
-- runner BEFORE dispatching, because a job aimed at an offline self-hosted
-- runner queues silently for 24 h instead of failing — which nothing alerts on.
--
-- Auth: sends the narrow-privilege shared secret from Vault
-- (`dispatch_workflow_secret`, created separately so its value never enters the
-- repo), NOT the service-role key — so no broadly privileged credential is
-- stored in the database, and nothing sensitive sits in plaintext in cron.job.
-- The value must match the DISPATCH_SECRET edge-function secret; rotating means
-- updating both.
--
-- Cadence stays HOURLY to match what cron-jobs.org was doing. Phase 3 is where
-- it goes back to 15 min, which is free once the Pi is serving.
--
-- Created INACTIVE on purpose: the edge secrets (GH_DISPATCH_PAT,
-- DISPATCH_SECRET) are set by hand in the Supabase dashboard, and firing before
-- they exist would just log 403s.

select cron.schedule(
  'dispatch-dbt-run-hourly',
  '0 * * * *',
  $job$
  select net.http_post(
    url := 'https://jnfwmdirvnqfpfhtipld.supabase.co/functions/v1/dispatch-workflow',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'dispatch_workflow_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'dispatch-dbt-run-hourly'),
  active := false
);

-- Activate once the edge secrets exist:
--   select cron.alter_job((select jobid from cron.job
--                          where jobname = 'dispatch-dbt-run-hourly'),
--                         active := true);
