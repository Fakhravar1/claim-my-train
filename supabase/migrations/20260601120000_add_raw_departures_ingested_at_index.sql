create index if not exists raw_departures_ingested_at_idx
  on public.raw_departures (ingested_at);