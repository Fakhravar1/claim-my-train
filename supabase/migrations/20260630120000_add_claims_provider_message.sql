-- Carry the operator's own page message (SJ confirmation / already-claimed / eligibility
-- verdict) onto the claim so it can be shown to the user across statuses — not only the
-- destructive-red error_message. See claim-worker/submit_sj.py + Settings "Mina ärenden".
alter table public.claims add column if not exists provider_message text;
comment on column public.claims.provider_message is 'Verbatim message from the operator (e.g. SJ confirmation / already-claimed / eligibility verdict) so it can be shown to the user across statuses, not just errors.';
