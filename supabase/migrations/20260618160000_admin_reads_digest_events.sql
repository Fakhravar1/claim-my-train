-- Lets the single owner account read public.digest_events from the frontend
-- (the /admin "Digest-statistik" page). digest_events had RLS enabled with zero
-- policies, so authenticated reads were denied and only the service-role
-- resend-webhook could write. This adds a SELECT policy scoped to the owner's
-- uid; no other user gains access. The same id lives in src/lib/admin.ts.
--
-- Applied via the Supabase dashboard / MCP (CLAUDE.md §11 — this file is
-- documentation, not replayed by the CLI). Reversible:
--   drop policy "Owner reads digest_events" on public.digest_events;
create policy "Owner reads digest_events"
on public.digest_events
for select
to authenticated
using ((select auth.uid()) = '70924f63-a550-49f1-b4d4-18b0497a6d5c'::uuid);
