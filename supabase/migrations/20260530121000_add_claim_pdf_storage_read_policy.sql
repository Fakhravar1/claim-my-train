-- Lets a signed-in user read only their own generated claim PDFs in the private
-- `claims` Storage bucket (worker writes them at `{user_id}/{claim_id}.pdf`).
-- The worker uses the service-role key and bypasses this. Currently unused by
-- the frontend (PDF download was removed) but kept for any future read access.
drop policy if exists "Users can read own claim PDFs" on storage.objects;
create policy "Users can read own claim PDFs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'claims'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
