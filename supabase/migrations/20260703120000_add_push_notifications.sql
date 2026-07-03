-- Web Push: per-device subscriptions + once-ever push dedupe log (mirrors digest_log).
-- Applied via MCP apply_migration 2026-07-03 (§11 Option A: live DB is source of truth;
-- this file is documentation, not replayed by the CLI).

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
create policy "select own push subscriptions" on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);
create policy "insert own push subscriptions" on public.push_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);
create policy "update own push subscriptions" on public.push_subscriptions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own push subscriptions" on public.push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);
create index idx_push_subscriptions_user on public.push_subscriptions (user_id);

create table public.push_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journey_key text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, journey_key)
);

alter table public.push_log enable row level security;
create policy "read own push log" on public.push_log
  for select to authenticated using (auth.uid() = user_id);
-- writes happen only via the service-role edge function (bypasses RLS)
create index idx_push_log_user on public.push_log (user_id);
