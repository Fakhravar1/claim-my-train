alter table public.profiles
  add column if not exists claim_email text,
  add column if not exists claim_mobile text,
  add column if not exists claim_ticket_id text,
  add column if not exists claim_personnummer text,
  add column if not exists is_period_ticket boolean not null default false,
  add column if not exists ticket_valid_until date;

