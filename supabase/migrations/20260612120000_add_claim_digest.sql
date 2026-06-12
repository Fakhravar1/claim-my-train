-- Claim digest: per-user frequency preference + send audit log.
--
-- NOTE (§11): applied via MCP apply_migration on 2026-06-12. This file is
-- documentation of the live state, not replayed by the CLI.
alter table public.profiles
  add column digest_frequency text not null default 'off'
  check (digest_frequency in ('off', 'daily', 'weekly'));

create table public.digest_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journey_key text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, journey_key)        -- a journey is digested at most once per user
);

alter table public.digest_log enable row level security;
create policy "read own digest log" on public.digest_log
  for select to authenticated using (auth.uid() = user_id);
-- writes happen only via the service-role edge function (bypasses RLS)

create index idx_digest_log_user on public.digest_log (user_id);
