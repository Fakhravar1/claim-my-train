-- Cleanup of the deprecated REST-only journey path + one unused dim.
-- Frontend moved to public.v_journeys (over dbt_dev.fct_journeys) on 2026-06-11;
-- these views had no remaining consumers. All are dbt-managed views, recreatable
-- from git history + dbt build if ever needed.
-- fct_departures and fct_claimable_journeys are deliberately KEPT (claim retention layer).
--
-- NOTE (§11): applied via MCP apply_migration on 2026-06-11. This file is
-- documentation of the live state, not replayed by the CLI.
drop view if exists public.v_passenger_journeys;
drop view if exists dbt_dev.fct_passenger_journeys;
drop view if exists dbt_dev.dim_line;
