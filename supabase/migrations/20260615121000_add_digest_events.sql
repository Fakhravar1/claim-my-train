-- Resend open/click tracking for digest emails. Populated by the resend-webhook
-- edge function (service-role); user_id/frequency are resolved from the Resend
-- tags set at send time. Internal analytics only — no public read. (CLAUDE.md §16)
--
-- NOTE (§11): applied via MCP apply_migration on 2026-06-15. This file documents
-- the live state; it is not replayed by the CLI.
create table public.digest_events (
  id uuid primary key default gen_random_uuid(),
  resend_email_id text,
  event_type text not null,            -- sent / delivered / opened / clicked / bounced / complained
  user_id uuid,                        -- nullable: resolved from the user_id tag
  frequency text,                      -- daily / weekly, from the frequency tag
  link_url text,                       -- populated for click events
  raw jsonb,                           -- full webhook payload for forensics
  created_at timestamptz not null default now()
);

alter table public.digest_events enable row level security;
-- No policies: only the service-role webhook writes (bypasses RLS); nothing reads
-- from the client. Querying happens via SQL/MCP for now.

create index idx_digest_events_type_time on public.digest_events (event_type, created_at);
create index idx_digest_events_email on public.digest_events (resend_email_id);
