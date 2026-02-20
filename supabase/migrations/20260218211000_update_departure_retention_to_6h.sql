-- Keep departures history focused for UI "Load earlier" browsing.
-- This lowers retention from 24 hours to 6 hours.
CREATE OR REPLACE FUNCTION delete_old_departures()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.departures
  WHERE fetched_at < NOW() - INTERVAL '6 hours';
END;
$$;
