-- idx_digest_events_type_time has never been used (advisor lint 0005) and digest_events is a
-- tiny (~26-row) analytics table where the index only adds write overhead. Drop it.
--
-- NB (repo-honesty): recorded per CLAUDE.md §11 Option A. Applied via the Supabase MCP
-- apply_migration (remote), not replayed via the CLI.

drop index if exists public.idx_digest_events_type_time;
