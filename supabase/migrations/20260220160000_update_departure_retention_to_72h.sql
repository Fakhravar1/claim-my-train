-- Keep departures history for 72 hours to reduce repeated upstream API calls.
CREATE OR REPLACE FUNCTION delete_old_departures()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.departures
  WHERE fetched_at < NOW() - INTERVAL '72 hours';
END;
$$;
