-- Signature capture for the Skånetrafiken reklamation PDF.
--
-- The user draws their signature once (Settings). It is stored as a PNG in a
-- private Storage bucket; profiles.signature_path points at it. Each filed
-- claim snapshots the signature_path it was authorised with, plus a per-filing
-- consent timestamp, so the audit trail is independent of any later signature
-- change. The claim-worker stamps the PNG onto the form at generation time.
--
-- NOTE (repo convention §11, Option A): this file is documentation only. The
-- DDL below was applied directly to the live database; it is NOT replayed via
-- the Supabase CLI. Re-running it would be a no-op thanks to the IF NOT EXISTS
-- / ON CONFLICT guards, except the CREATE POLICY statements which would error.

-- 1. profiles: pointer to the user's one saved signature.
alter table public.profiles add column if not exists signature_path text;

-- 2. claims: per-filing consent audit trail + signature snapshot.
alter table public.claims add column if not exists consented_at timestamptz;
alter table public.claims add column if not exists signature_path text;

-- 3. Private bucket for signature PNGs.
insert into storage.buckets (id, name, public)
values ('signatures', 'signatures', false)
on conflict (id) do nothing;

-- 4. RLS: a user may only touch objects under their own {user_id}/ folder.
--    The claim-worker uses the service-role key and bypasses these.
create policy "sig_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sig_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sig_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text);
