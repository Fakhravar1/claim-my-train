-- Snapshot the journey's service (train) number onto the claim. Vy's reimbursement form
-- (submit_vy) has a required "Tågnummer" field; the train number lives on the journey
-- (v_journeys.service_number) but wasn't being snapshotted, so the worker had nothing to
-- fill. Captured at filing time via buildClaimPayload, like the rest of the journey snapshot.
--
-- NOTE (§11): applied via apply_migration, NOT replayed through the CLI. Repo documentation.
alter table public.claims add column if not exists service_number text;
