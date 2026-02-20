-- Fix search path security warning for delete_old_departures function
CREATE OR REPLACE FUNCTION delete_old_departures()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.departures
  WHERE fetched_at < NOW() - INTERVAL '24 hours';
END;
$$;