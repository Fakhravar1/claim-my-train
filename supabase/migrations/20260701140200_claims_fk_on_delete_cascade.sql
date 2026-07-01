-- claims.user_id was ON DELETE SET NULL, which orphaned a deleted user's claims as null-user
-- rows that still hold PII (booking_email, signature_path) and can never be fulfilled (the
-- worker cannot load a profile). Switch to CASCADE so account deletion cleanly removes the
-- user's claims (GDPR-friendly).
--
-- Behavior change: deleting an auth user now DELETES their claims (previously the claims
-- survived with user_id=NULL). Revert = swap back to ON DELETE SET NULL.
--
-- NB (repo-honesty): recorded per CLAUDE.md §11 Option A. Applied via the Supabase MCP
-- apply_migration (remote), not replayed via the CLI.

alter table public.claims drop constraint claims_user_id_fkey;
alter table public.claims
  add constraint claims_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- Clean up the one pre-existing dead orphan (user already deleted; status='error', never
-- submitted). CASCADE only acts at future deletion time, so this existing null-user row must
-- be removed explicitly.
delete from public.claims where user_id is null;
