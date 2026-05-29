-- Allow a signed-in user to insert their own profile row.
-- Required because the Settings page uses upsert (INSERT ... ON CONFLICT),
-- which RLS blocks without an INSERT policy.
create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- Harden the existing UPDATE policy so a user can't repoint their row's id.
alter policy "Users can update own profile"
  on public.profiles
  with check (auth.uid() = id);