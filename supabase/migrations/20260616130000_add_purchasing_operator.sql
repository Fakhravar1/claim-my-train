-- 2026-06-16  profiles.purchasing_operator — claim guardrail
-- ---------------------------------------------------------------------------
-- DOCUMENTATION ONLY — applied live via apply_migration (§11); not CLI-replayed.
--
-- Which operator/vendor the user bought their ticket from (a user-chosen setting
-- on Settings → Ticket). For now this is purely a GUARDRAIL: the frontend blocks
-- claim filing (delay-alerts confirm dialog + bulk review page) unless this is
-- 'skanetrafiken' — the single supported claim regime. A user on an SJ/Snälltåget
-- ticket should use that operator's own förseningsersättning process.
--
-- Later this becomes the key into per-operator compensation rules
-- (dim_compensation_rules, §9 v3). The journey fact stays operator-agnostic
-- (§5/§8) — operator is a user attestation, not a data-derived fact, because the
-- realtime feed can't cleanly map station→operator (operators overlap; TV labels
-- are contractor codes).
--
-- Nullable so existing rows stay valid; CHECK constrains the allowed set.
alter table public.profiles
  add column if not exists purchasing_operator text
  check (purchasing_operator in ('skanetrafiken', 'sj', 'snalltaget', 'other'));

comment on column public.profiles.purchasing_operator is
  'Ticket vendor the user bought from (user-chosen setting). Guardrail: only ''skanetrafiken'' can file claims for now; future key into dim_compensation_rules.';
