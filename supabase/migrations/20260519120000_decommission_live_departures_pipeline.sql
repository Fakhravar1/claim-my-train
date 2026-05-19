-- Decommission the legacy live-departures pipeline.
-- Frontend migrated to public.v_passenger_journeys (Index.tsx + YellowAlerts.tsx).
-- Admin analytics page is being dropped; the RPCs and their underlying tables are obsolete.

-- 1. Stop new writes by unscheduling the cron that drives the edge function.
select cron.unschedule('claim-collection-15m');

-- 2. Drop RPCs that depend on the tables we're about to drop.
drop function if exists public.trigger_claim_collection();
drop function if exists public.delete_old_departures();
drop function if exists public.get_admin_api_analytics(timestamp with time zone, text);
drop function if exists public.get_api_usage_daily(timestamp with time zone, text);

-- 3. Drop tables.
drop table if exists public.departures cascade;
drop table if exists public.train_names cascade;
drop table if exists public.yellow_alert_history cascade;
drop table if exists public.claimable_corridor_windows cascade;
drop table if exists public.api_call_events cascade;
drop table if exists public.stations_master cascade;
