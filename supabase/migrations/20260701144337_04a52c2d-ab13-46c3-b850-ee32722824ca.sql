
-- Fix 1: Restrict claims SELECT policy to authenticated role (was public)
DROP POLICY IF EXISTS "users select own claims" ON public.claims;
CREATE POLICY "users select own claims" ON public.claims
  FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

-- Fix 2 (Lovable): set security_invoker=on on the four public wrapper views.
-- REVERTED — see 20260701150000_revert_public_view_security_invoker.sql.
-- These views expose non-sensitive public journey/station data over dbt_dev
-- tables that have NO RLS, and are deliberately anon-readable. security_invoker
-- makes anon read the underlying dbt_dev tables directly (no grant there) →
-- "permission denied for view fct_journeys" → the board showed zero departures.
-- There is no per-user RLS to enforce, so definer semantics are correct here.
-- (Kept as a record; migration files are documentation, not replayed — §11.)
-- ALTER VIEW public.v_station_claim_authority SET (security_invoker = on);
-- ALTER VIEW public.v_active_stations SET (security_invoker = on);
-- ALTER VIEW public.v_claimable_journeys SET (security_invoker = on);
-- ALTER VIEW public.v_journeys SET (security_invoker = on);
