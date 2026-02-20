
CREATE TABLE IF NOT EXISTS public.yellow_alert_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL,
  line text NOT NULL,
  line_name text NOT NULL,
  departure_station text NOT NULL,
  arrival_station text NOT NULL,
  departure_datetime timestamptz NOT NULL,
  scheduled_arrival_datetime timestamptz NOT NULL,
  actual_arrival_datetime timestamptz NOT NULL,
  arrival_delay_minutes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.yellow_alert_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view yellow alert history" ON public.yellow_alert_history;

CREATE POLICY "Anyone can view yellow alert history"
  ON public.yellow_alert_history
  FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_yellow_alert_history_actual_arrival
  ON public.yellow_alert_history (actual_arrival_datetime DESC);
