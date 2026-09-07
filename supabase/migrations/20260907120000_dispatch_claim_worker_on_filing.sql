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

-- 3. The dispatch itself, shared by both triggers below.
create or replace function public.dispatch_claim_worker_now()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  secret text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'claim_dispatch_secret';

  if secret is null then
    return;  -- not configured yet: the */15 cron still covers it
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
exception when others then
  -- NEVER fail the user's filing over a dispatch. The claim row is what matters;
  -- the cron picks it up regardless.
  raise warning 'dispatch_claim_worker_now: %', sqlerrm;
end;
$$;

revoke all on function public.dispatch_claim_worker_now() from public;
revoke all on function public.dispatch_claim_worker_now() from anon, authenticated;

-- 4. INSERT — STATEMENT-level with a transition table, not row-level: the
--    /claim-review digest path bulk-upserts many claims in one statement, and one
--    worker run drains all of them, so a dispatch per row would be pure noise.
create or replace function public.tg_dispatch_claim_worker_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Only statements that produced a row the worker will actually poll for.
  if exists (
    select 1 from inserted
    where status in ('pending', 'sj_authorized', 'hlt_authorized',
                     'kalmar_authorized', 'vy_authorized')
  ) then
    perform public.dispatch_claim_worker_now();
  end if;
  return null;
end;
$$;

drop trigger if exists claims_dispatch_worker_on_insert on public.claims;
create trigger claims_dispatch_worker_on_insert
  after insert on public.claims
  referencing new table as inserted
  for each statement
  execute function public.tg_dispatch_claim_worker_insert();

-- 5. UPDATE — ROW-level with a WHEN clause. Re-filing an errored claim reopens the
--    row IN PLACE (useStartClaim's 23505 path, the sjEdit booking editor) and a
--    human authorising a dry-run flips it to *_authorized: both are filings.
--    Row-level here because Postgres refuses a transition table on a trigger with a
--    column list, and the WHEN clause is the more precise filter anyway — it fires
--    only on an actual TRANSITION into a pollable status, so the worker's own
--    updates (-> generated/submitted/error) cannot loop, and neither can an
--    outcome/paid_out edit that leaves status untouched. Nothing bulk-updates
--    claims to 'pending', so per-row here costs at most one dispatch.
create or replace function public.tg_dispatch_claim_worker_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.dispatch_claim_worker_now();
  return null;
end;
$$;

drop trigger if exists claims_dispatch_worker_on_update on public.claims;
create trigger claims_dispatch_worker_on_update
  after update on public.claims
  for each row
  when (new.status is distinct from old.status
        and new.status in ('pending', 'sj_authorized', 'hlt_authorized',
                           'kalmar_authorized', 'vy_authorized'))
  execute function public.tg_dispatch_claim_worker_update();

-- PostgREST caches the schema; make the new RPC visible to the edge function now
-- rather than whenever the next reload happens to land.
notify pgrst, 'reload schema';
