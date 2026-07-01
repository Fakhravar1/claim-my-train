-- Revert Fix 2 of 20260701144337 (security_invoker=on on the public wrapper views).
--
-- Why: those four views (v_journeys, v_active_stations, v_claimable_journeys,
-- v_station_claim_authority) are deliberately anon-readable and sit over dbt_dev
-- tables that have NO RLS. With security_invoker=on the view executes as the
-- querying role, so anon reads dbt_dev.fct_journeys directly, lacks SELECT there,
-- and gets "permission denied for view fct_journeys" — the board showed zero
-- departures for every date / O-D. Because the underlying tables carry no
-- per-user RLS, invoker semantics enforce nothing here; definer is correct.
--
-- The Supabase security_definer_view advisor will re-flag these; that is an
-- accepted false positive for public, non-RLS data views.

ALTER VIEW public.v_journeys              SET (security_invoker = off);
ALTER VIEW public.v_active_stations       SET (security_invoker = off);
ALTER VIEW public.v_claimable_journeys    SET (security_invoker = off);
ALTER VIEW public.v_station_claim_authority SET (security_invoker = off);

-- NB: Fix 1 (restricting the claims SELECT policy to the authenticated role) is
-- correct and stays in place — claims IS an RLS-protected, user-scoped table.
