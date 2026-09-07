-- Fire the Claim PDF worker when a claim is FILED, not up to an hour later.
--
-- Before this, filing was a client-side INSERT into public.claims and nothing told
-- the backend: the worker polls on a */15 schedule, and GitHub's free-tier jitter
-- makes that 15 min–1 h in practice. For SJ, where the worker drives the operator's
-- live form, that delay is the entire gap between "filed" and "lodged with SJ".
--
-- Chain (mirrors the dbt one — pg_cron/trigger -> edge function -> GitHub):
--
--   INSERT/UPDATE on public.claims  (statement-level trigger)
--        |  Bearer = Vault secret 'claim_dispatch_secret'
--        v
--   dispatch-claim-worker edge fn  ->  workflow_dispatch claim-pdf-worker.yml
--
-- The */15 cron STAYS. It is now the retry net (a claim whose dispatch was dropped,
-- an *_authorized row a human approved, a run that failed), not the primary path.
--
-- WHY NOT the existing dispatch-workflow function: its allowlist deliberately keeps
-- the claim workers out of reach of DISPATCH_SECRET, so that a leak of that secret
-- can never make us act at an operator on a user's behalf. Separate function,
-- separate secret, and it can fire exactly one workflow.
--
-- CLAUDE.md §11: applied via the Supabase SQL API; this file is the repo's record.

-- 1. The shared secret. Generated IN the database so the value never passes through
--    a repo, a shell history or a chat transcript — nothing needs to read it back;
--    the trigger reads it from Vault and the edge function compares it in SQL.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'claim_dispatch_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'claim_dispatch_secret',
      'Bearer for the claims trigger -> dispatch-claim-worker edge function.'
    );
  end if;
end $$;

-- 2. Secret check for the edge function. SECURITY DEFINER because vault is not
--    readable by service_role; returns a boolean, never the secret.
create or replace function public.check_claim_dispatch_secret(candidate text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'claim_dispatch_secret'
      and decrypted_secret = candidate
  );
$$;

revoke all on function public.check_claim_dispatch_secret(text) from public;
revoke all on function public.check_claim_dispatch_secret(text) from anon, authenticated;
grant execute on function public.check_claim_dispatch_secret(text) to service_role;

-- 3. The trigger. STATEMENT-level with a transition table, not row-level: the
--    /claim-review digest path bulk-upserts many claims in one statement, and one
--    worker run drains all of them — a dispatch per row would be pure noise.
create or replace function public.dispatch_claim_worker()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  secret text;
begin
  -- Only rows the worker will actually pick up (worker.py's poll filter).
  if not exists (
    select 1 from inserted
    where status in ('pending', 'sj_authorized', 'hlt_authorized',
                     'kalmar_authorized', 'vy_authorized')
  ) then
    return null;
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'claim_dispatch_secret';

  if secret is null then
    return null;  -- not configured yet: the */15 cron still covers it
  end if;

  perform net.http_post(
    url := 'https://jnfwmdirvnqfpfhtipld.supabase.co/functions/v1/dispatch-claim-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  return null;
exception when others then
  -- NEVER fail the user's filing over a dispatch. The claim row is what matters;
  -- the cron picks it up regardless.
  raise warning 'dispatch_claim_worker: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists claims_dispatch_worker_on_insert on public.claims;
create trigger claims_dispatch_worker_on_insert
  after insert on public.claims
  referencing new table as inserted
  for each statement
  execute function public.dispatch_claim_worker();

-- Re-filing an errored claim reopens the row IN PLACE (useStartClaim's 23505 path,
-- and the sjEdit booking editor), so an UPDATE back to 'pending' is a filing too.
-- Worker-driven updates (-> generated/submitted/error) don't match the status
-- filter above, so they can't loop.
drop trigger if exists claims_dispatch_worker_on_update on public.claims;
create trigger claims_dispatch_worker_on_update
  after update of status on public.claims
  referencing new table as inserted
  for each statement
  execute function public.dispatch_claim_worker();

-- PostgREST caches the schema; make the new RPC visible to the edge function now
-- rather than whenever the next reload happens to land.
notify pgrst, 'reload schema';
