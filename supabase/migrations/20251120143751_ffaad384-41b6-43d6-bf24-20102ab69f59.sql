-- Create departures table to store the latest 24 hours of departure information
CREATE TABLE public.departures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  line TEXT NOT NULL,
  operator TEXT NOT NULL,
  line_name TEXT NOT NULL,
  departure_station TEXT NOT NULL,
  arrival_station TEXT NOT NULL,
  departure_time TIME NOT NULL,
  departure_date DATE NOT NULL,
  scheduled_time TIME,
  arrival_time TIME,
  arrival_date DATE,
  track TEXT,
  is_delayed BOOLEAN NOT NULL DEFAULT false,
  delay_minutes INTEGER DEFAULT 0,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.departures ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Anyone can view departures"
ON public.departures
FOR SELECT
USING (true);

-- Create index for efficient querying by date and time
CREATE INDEX idx_departures_datetime ON public.departures(departure_date, departure_time);
CREATE INDEX idx_departures_fetched_at ON public.departures(fetched_at);

-- Create function to delete departures older than 24 hours
CREATE OR REPLACE FUNCTION delete_old_departures()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.departures
  WHERE fetched_at < NOW() - INTERVAL '24 hours';
END;
$$;