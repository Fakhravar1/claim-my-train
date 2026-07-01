
-- Fix 1: Restrict claims SELECT policy to authenticated role (was public)
DROP POLICY IF EXISTS "users select own claims" ON public.claims;
CREATE POLICY "users select own claims" ON public.claims
  FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

-- Fix 2: Convert public views to SECURITY INVOKER so RLS is enforced as the querying user
ALTER VIEW public.v_station_claim_authority SET (security_invoker = on);
ALTER VIEW public.v_active_stations SET (security_invoker = on);
ALTER VIEW public.v_claimable_journeys SET (security_invoker = on);
ALTER VIEW public.v_journeys SET (security_invoker = on);
