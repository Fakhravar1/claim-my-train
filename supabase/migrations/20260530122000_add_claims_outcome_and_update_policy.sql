-- User-set claim outcome (paid out / denied), separate from the worker-managed
-- pipeline `status` so the two never collide. Plus the UPDATE RLS policy that
-- lets a user record the outcome on their own claims.
alter table public.claims
  add column if not exists outcome text
    check (outcome in ('paid_out', 'denied'));

drop policy if exists "users update own claims" on public.claims;
create policy "users update own claims"
  on public.claims
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
