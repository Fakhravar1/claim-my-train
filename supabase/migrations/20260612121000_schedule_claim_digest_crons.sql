-- Digest schedules: daily 18:00 UTC (~20:00 Stockholm) + weekly Sunday same time.
-- The function is deployed verify_jwt=false — headerless POSTs like these work
-- (see CLAUDE.md §15: cron-driven collectors must not require a bearer token).
--
-- NOTE (§11): applied via MCP apply_migration on 2026-06-12. This file is
-- documentation of the live state, not replayed by the CLI.
select cron.schedule(
  'send-claim-digest-daily',
  '0 18 * * *',
  $$ select net.http_post(
       url := 'https://jnfwmdirvnqfpfhtipld.supabase.co/functions/v1/send-claim-digest',
       headers := '{"Content-Type":"application/json"}'::jsonb,
       body := '{"frequency":"daily"}'::jsonb
     ); $$
);
select cron.schedule(
  'send-claim-digest-weekly',
  '0 18 * * 0',
  $$ select net.http_post(
       url := 'https://jnfwmdirvnqfpfhtipld.supabase.co/functions/v1/send-claim-digest',
       headers := '{"Content-Type":"application/json"}'::jsonb,
       body := '{"frequency":"weekly"}'::jsonb
     ); $$
);
