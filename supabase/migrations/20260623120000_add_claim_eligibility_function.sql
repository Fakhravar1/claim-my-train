-- public.claim_eligibility(...) — the lazy, per-USER claim-rule resolver.
--
-- fct_journeys only computes the 20-min/cancel FLOOR (is_claimable, for display + the
-- 90-day retention layer). The BINDING rule depends on (a) which operator the user
-- attested they travelled with (profiles.purchasing_operator) and (b) the journey's
-- route distance, which picks the legal regime: <150 km = Swedish regional (Lag 2015:953,
-- 50/75/100 % @ 20/40/60 min), >=150 km = EU 2021/782 (25/50 % @ 60/120 min). This
-- function does that lookup against dim_compensation_rules and returns whether the journey
-- is claimable for that user + the tier % owed. Called by the frontend (per-journey, with
-- the signed-in user's operator) and by the claim flow before filing. §8: user-side
-- resolution stays lazy — we never pre-compute every (user x delay x ticket) combination.
--
-- Unknown distance (NULL route_km, e.g. an unresolved crosswalk) defaults to the
-- CONSERVATIVE long-distance band (higher threshold) so we never over-claim an SJ journey.
--
-- Reads the dbt seed in its dev schema (dbt_dev), consistent with CLAUDE.md §11 recovery
-- SQL. The seed must exist (dbt build) before this function is created — SQL function
-- bodies are validated against referenced relations at CREATE time.
--
-- Applied to the live DB via MCP apply_migration on 2026-06-23; this file is the repo
-- record (Option A, CLAUDE.md §11 — not replayed by the CLI).

create or replace function public.claim_eligibility(
    p_delay_seconds integer,
    p_canceled      boolean,
    p_route_km      numeric,
    p_operator      text
)
returns table (
    is_claimable      boolean,
    tier_pct          integer,
    tier_model        text,
    min_delay_seconds integer,
    route_band        text
)
language sql
stable
as $$
    select
        (coalesce(p_delay_seconds, 0) >= r.min_delay_seconds)
            or (r.includes_cancellations and coalesce(p_canceled, false))   as is_claimable,
        case
            -- cancellation pays the top tier the regime offers
            when r.includes_cancellations and coalesce(p_canceled, false)
                then coalesce(r.tier3_pct, r.tier2_pct, r.tier1_pct)
            when r.tier3_min_seconds is not null and coalesce(p_delay_seconds, 0) >= r.tier3_min_seconds then r.tier3_pct
            when r.tier2_min_seconds is not null and coalesce(p_delay_seconds, 0) >= r.tier2_min_seconds then r.tier2_pct
            when r.tier1_min_seconds is not null and coalesce(p_delay_seconds, 0) >= r.tier1_min_seconds then r.tier1_pct
            else null
        end                                                                 as tier_pct,
        r.tier_model,
        r.min_delay_seconds,
        r.route_distance_min_km || '-' || coalesce(r.route_distance_max_km::text, 'inf')  as route_band
    from dbt_dev.dim_compensation_rules r
    where r.authority_key = p_operator
      and coalesce(p_route_km, 9999) >= r.route_distance_min_km
      and (r.route_distance_max_km is null or coalesce(p_route_km, 9999) < r.route_distance_max_km)
    order by r.route_distance_min_km desc   -- defensive: pick the matched band if ranges ever overlap
    limit 1;
$$;

comment on function public.claim_eligibility(integer, boolean, numeric, text) is
    'Per-user claim-rule resolver: given a journey delay/cancel/route_km and the user attested operator, returns claimable + tier %, looked up from dim_compensation_rules by (operator, route-distance band). Unknown distance -> conservative long-distance band. See migration header / CLAUDE.md §9 v3.';

grant execute on function public.claim_eligibility(integer, boolean, numeric, text) to anon, authenticated;
