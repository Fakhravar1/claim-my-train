# CLAUDE.md — Claim My Train

Standing project context. Read at the start of every session.

---

## 1. What this project is

A Supabase + dbt + Lovable-replaced frontend that automates train delay compensation claims for Swedish public-transport commuters.

**MVP scope (current focus):** Malmö C ↔ Copenhagen H corridor, Skånetrafiken JoJo periodbiljett holders, regional regime (Lag 2015:953), 20-min delay threshold. Single operator (VR Sverige AB operating Öresundståg under Skånetrafiken contract).

**Out of scope until MVP ships:** Other corridors, other operators, EU 2021/782 jurisdiction flip (>150 km), taxi/annan-transport compensation path, multi-ticket-type valuation, force-majeure detection, Resplus, analytics dashboards.

**Sequencing principle:** Ship MVP first, then layer complexity. Do not abstract for hypothetical second operators before the first one works end-to-end.

**Frontend layout:** `/` is the marketing landing for signed-out visitors (`src/pages/Landing.tsx`); a `<ProtectedFromAuth>` wrapper redirects signed-in users to `/app`, where the journeys page lives (`src/pages/Index.tsx`). Three themed regional pages under `/regions/{skanetrafiken,sl,vasttrafik}` — only Skånetrafiken is live; SL and Västtrafik are themed placeholders with "Coming soon — try Skånetrafiken" CTAs pointing at `/app`. The landing + regional pages are lazy-loaded; their `landing-base.css` (~30 KB) only loads when those routes mount, via `useLandingStyles` injecting `<style>` tags so the in-app shadcn theme on `/app`, `/login`, `/settings`, `/delay-alerts` isn't clobbered.

**Frontend data path:** `Index.tsx` (at `/app`) and `YellowAlerts.tsx` (at `/delay-alerts`) query `public.v_passenger_journeys` (wrapper over `dbt_dev.fct_passenger_journeys`) via `src/hooks/useJourneys.ts`. Index passes `onlyClaimable: false`; YellowAlerts passes `onlyClaimable: true`. Dropdowns on those pages plus Settings are driven by `src/hooks/useStations.ts` (GTFS IDs from `public.v_active_stations`). The legacy live-departures plumbing (the `get-train-departures` edge function, the `claim-collection-15m` cron, and tables `departures` / `train_names` / `yellow_alert_history` / `claimable_corridor_windows` / `api_call_events` / `stations_master`) has been retired. The `SAMS_TO_GTFS` / `GTFS_TO_SAMS` maps in `shared/stops.ts` survive only for inbound URL-param normalization on legacy bookmarks.

---

## 2. Communication style

User preferences are non-negotiable:

- **Brief, critical, to the point, challenging, honest, direct.** No padding, no hedging, no reverent praise of existing decisions.
- **Push back when the user is wrong.** Surface bad assumptions before they ship. The user explicitly invites disagreement.
- **Instructive over prescriptive.** When proposing code or queries, explain what the snippet does and the infrastructure behind it. The user is learning dbt and Kimball; comprehension matters more than speed.
- **Never execute irreversible changes without showing the plan first.** Propose diffs, explain what each change does and why, then ask for approval before running write operations (file edits, database migrations, force-pushes, deletions).
- **Minimum terminal use as a UX preference**, but understand Claude Code runs CLI commands as part of its job. The principle translates as: don't ask the user to type terminal commands when you can run them yourself; do show what's being run.
- **Reference Kimball's *Data Warehouse Toolkit* explicitly when applying its principles.** Concepts: fact grain, dimensional cardinality vs fact volume, conformed dimensions, degenerate dimensions, SCD-2, surrogate keys from business keys, drilling across.
- **Prompt the user to use dbt when applicable** rather than running raw SQL — they're trying to learn dbt as part of an analytics-engineering transition.

---

## 3. Tech stack

- **Database / backend:** Supabase (Postgres 17), project ID `jnfwmdirvnqfpfhtipld`, region `eu-west-1`.
- **Data modeling:** dbt — local dev uses `dbt-core==1.11.8` from `C:\Users\arian\trafiklab\dbt`; CI uses `dbt-postgres==1.10.0` (which pulls dbt-core ~1.10.x). Adapter is on a separate release schedule from core since dbt 1.8 — `dbt-postgres==1.11.8` doesn't exist. Uses `dbt-utils` package. Minor version drift between local and CI is acceptable for our model SQL.
- **dbt orchestration:** GitHub Actions workflow (`.github/workflows/dbt-run.yml`) runs `dbt build` on a `*/15` schedule plus `workflow_dispatch`. Secrets `SUPABASE_DB_{HOST,PORT,USER,PASSWORD,NAME}` hold the **session-pooler** connection string (port 5432) — not the transaction pooler (port 6543), which breaks dbt's multi-statement transactions and DDL. Reality check: GitHub's free-tier scheduled actions are best-effort with significant jitter — typical observed cadence is 1–4 hours between runs, not 15 min. Acceptable for the 60-day reklamation horizon; if sub-hour freshness ever matters, switch to Render Cron / Modal / a self-hosted runner.
- **Frontend:** `src/` (React/TypeScript + Vite + Tailwind + shadcn/ui). Marketing landing at `/` (`src/pages/Landing.tsx`); journeys app at `/app` behind auth (`src/pages/Index.tsx`). Three themed regional pages under `/regions/{skanetrafiken,sl,vasttrafik}` — Skånetrafiken is live; SL and Västtrafik are placeholders. Landing CSS is scope-injected via `src/hooks/useLandingStyles.ts`. In-app shadcn theme in `src/index.css` was retuned to the Skåne palette (forest green + warm cream + sunflower) so /app feels continuous with the landing.
- **Data source:** Trafiklab GTFS-RT feed → ingested to `public.raw_departures` every 15 min by pg_cron job `collect-raw-departures-15m`, which POSTs to the `collect-raw-departures` Supabase edge function.
- **Auth:** Supabase Auth, user profiles in `public.profiles`.

---

## 4. Repo structure

```
C:\Users\arian\trafiklab\          ← repo root
├── .github/
│   └── workflows/
│       └── dbt-run.yml             ← scheduled dbt build on GitHub Actions
├── dbt/                            ← dbt project root (dbt_project.yml lives here)
│   ├── macros/
│   │   └── generate_schema_name.sql        ← schema='public' override; lets dbt build wrappers in public, not dbt_dev_public
│   ├── models/
│   │   ├── staging/
│   │   │   └── stg_departures.sql
│   │   ├── dimensions/
│   │   │   ├── dim_stations.sql
│   │   │   ├── dim_active_stations.sql     ← stations referenced by fct_passenger_journeys (v1)
│   │   │   └── dim_line.sql
│   │   └── marts/
│   │       ├── fct_departures.sql           ← stop-event grain (table)
│   │       ├── fct_passenger_journeys.sql   ← journey-leg grain, v1 (table)
│   │       ├── v_active_stations.sql        ← public wrapper view (dbt-managed, schema='public')
│   │       ├── v_passenger_journeys.sql     ← public wrapper view (dbt-managed, schema='public')
│   │       └── _marts.yml                   ← model tests & docs
│   ├── packages.yml                ← dbt_utils dependency
│   └── dbt_project.yml
├── src/                            ← frontend (React/TS)
│   ├── pages/
│   ├── hooks/
│   ├── components/
│   └── integrations/supabase/      ← generated Supabase types
└── supabase/
    └── migrations/                 ← DDL history
```

---

## 5. Architecture conventions (Kimball)

- **Layered models:** `raw_` (untouched ingestion) → `stg_` (cleaning, type casting, no joins) → `dim_` / `fct_` (business-ready marts). Never edit raw; only derive from it.
- **Fact grain:** stated explicitly on every fact. Currently:
  - `fct_departures`: one row per (trip, start_date, stop_id, event_type). Stop-event grain.
  - `fct_passenger_journeys`: one row per (trip, start_date, origin_stop_id, destination_stop_id) where origin precedes destination in stop sequence. Journey-leg grain.
- **Surrogate keys:** every fact has one, generated from business keys via `dbt_utils.generate_surrogate_key([...])`. Never use ingestion artifacts (like raw row UUIDs) as the basis — must be deterministic from business keys.
- **Grain tests:** every fact has a `dbt_utils.unique_combination_of_columns` test on its natural grain. Grain violations = silent data corruption.
- **Degenerate dimensions:** business keys (trip_id, stop_id, etc.) live on the fact for traceability, alongside surrogate FKs to conformed dims.
- **Dedup at staging→fact boundary:** GTFS-RT publishes multiple updates per stop event; deduplicate with `row_number() over (partition by ... order by ingested_at desc) where rn = 1`. This is Kimball's late-arriving fact pattern (Toolkit Ch. 19).
- **No business-rule thresholds hardcoded in SQL when they're meant to be parameterized.** Current v1 hardcodes 20-min threshold; this gets refactored into `dim_compensation_rules` when we add operator #2 — not before.
- **No `CASE WHEN operator = '...'` branches in fact tables.** Operator-specific logic belongs in joined rule tables, not in fact SQL.
- **Rules attach to claim authority + route characteristics, NOT to operator.** Operator concessions change; rules don't. The "operator-agnostic fact" pattern means `fct_passenger_journeys` carries `agency__operator` as descriptive context only — never as a rule key.
- **Materialization strategy:** staging and dimensions are views; facts with expensive logic (dedup, self-joins) are tables with indexes on dominant query patterns. Per-model `{{ config(materialized='table') }}` in each file. Diagnose with `explain (analyze, buffers)` before changing materialization; never materialize speculatively.
- **Presentation-layer wrapper views** in `public` (`v_passenger_journeys`, `v_active_stations`, future additions) are dbt models with `schema='public'`. The custom `generate_schema_name` macro in `dbt/macros/` makes the `schema='public'` config land objects directly in `public` instead of the dbt-default `dbt_dev_public`. Wrappers are part of the dbt DAG (via `ref(...)`), so they rebuild automatically when underlying facts/dims change. No manual recreation needed after materialization changes.

---

## 6. Current state (v1, working as of latest commit)

**Dataflow (what auto-updates vs what doesn't):**

```
Trafiklab GTFS-RT
       │
       │ (pg_cron `collect-raw-departures-15m`, every 15 min,
       │  POSTs to collect-raw-departures edge function)
       ▼
public.raw_departures (table — cron writes here)
       │
       │ stg_departures (view — live, recomputes on every SELECT)
       │
       │ (dbt build, every ~15 min via GitHub Actions —
       │  in practice 1–4 hours apart due to GH scheduling jitter)
       ▼
dbt_dev.fct_departures (table)
dbt_dev.fct_passenger_journeys (table)
dbt_dev.dim_active_stations (table)
       │
       │ public.v_passenger_journeys, public.v_active_stations
       │ (dbt-managed views — reads of these go straight to the underlying
       │  tables, so freshness = "last dbt build" not "last raw insert")
       ▼
Frontend (useStations, useJourneys hooks via Supabase JS client)
```

**Critical fact about freshness:** dimension and staging models are views (always live), but the facts and `dim_active_stations` are materialized tables (stale until the next `dbt build` runs). The frontend cannot show a claimable journey until the scheduled Action has processed the new raw row into `fct_passenger_journeys`. Currently 1–4 hours of GH scheduling drift between ingest and visibility.

**Working:**
- `raw_departures` ingestion from Trafiklab GTFS-RT.
- Scheduled `dbt build` via `.github/workflows/dbt-run.yml` keeps `fct_*` and `dim_active_stations` tables fresh. Triggers: `schedule: */15` + `workflow_dispatch` (for manual runs from the Actions tab). Logs visible per-run in the GitHub Actions UI.
- `stg_departures` cleaning layer.
- `fct_departures` and `fct_passenger_journeys` are tables (not views) with indexes on dominant query patterns:
  - `fct_departures`: `(trip__trip_id, trip__start_date, stop_sequence)` and `(event_type, stop__id)`.
  - `fct_passenger_journeys`: `(origin_stop_id, destination_stop_id, trip__start_date)` plus a partial index on `(is_claimable) where is_claimable = true`.
  Frontend query time dropped from ~6s to sub-50ms post-materialization.
- `dim_stations`, `dim_line` views.
- `dim_active_stations` view filters `dim_stations` to stops appearing as origin or destination in `fct_passenger_journeys`. Source for the frontend stations dropdown.
- `fct_passenger_journeys` v1 claim logic:
  ```sql
  is_claimable = (coalesce(dest.arrival_delay, 0) >= 1200)
                 or coalesce(dest.canceled, false)
  ```
  Threshold is hardcoded 1200 seconds (20 minutes). Cancelled trains always claimable.
- All dbt tests passing: unique journey_key, not_null on grain columns, unique combination of (trip_id, start_date, origin_stop_id, destination_stop_id).
- `public.v_passenger_journeys` and `public.v_active_stations` are dbt-managed views (`dbt/models/marts/v_*.sql`) materialized into the `public` schema via the `generate_schema_name` macro override. Each model declares a `post_hook` that grants `select` to `anon` and `authenticated`. Curated column lists exclude internal grain plumbing (`origin_sequence`, `destination_sequence`, `destination_delay_seconds`, `dbt_scd_id`, `ingested_at`).
- Frontend hooks `useStations` (`src/hooks/useStations.ts`) and `useJourneys` (`src/hooks/useJourneys.ts`) consume the public wrappers. Index.tsx, YellowAlerts.tsx, and Settings.tsx all use `useStations` for dropdowns; Index.tsx and YellowAlerts.tsx use `useJourneys` for the journey lists (Index with `onlyClaimable: false`, YellowAlerts with `onlyClaimable: true`).
- `shared/stops.ts` includes a `SAMS_TO_GTFS` / `GTFS_TO_SAMS` translation map bridging Trafiklab sams-id (legacy `get-train-departures` edge function imports) and GTFS (everything in dbt and the frontend). Only used for inbound URL-param normalization in YellowAlerts/Index after the Index migration.
- ✅ Marketing landing page at `/` (`src/pages/Landing.tsx`) with three regional pages under `/regions/{skanetrafiken,sl,vasttrafik}`. Skånetrafiken is the live region; SL and Västtrafik are themed placeholders ("Coming soon — try Skånetrafiken") for future operator scaffolding. Per-region visuals live in `src/themes/<slug>/` (HeroScene, SignupScene, Vehicle SVGs + `theme.css` token overrides). Landing CSS is scope-injected via `src/hooks/useLandingStyles.ts` so it doesn't bleed into the in-app shadcn theme on `/app` and friends.

**Data volume:** ~22k journey rows currently, ~220 claimable. Three operators present: VR Sverige AB (Öresundståg, 880 trips), Pågatåg (1,866 trips), SJ AB (7 trips).

---

## 7. Frontend approach

The frontend was being built in Lovable's UI, then partially via Cursor. Now being taken over via Claude Code. The user wants to STOP Lovable's auto-commit interfering with our work.

**Existing pages (likely needing rework):**
- `src/pages/Index.tsx`
- `src/pages/Settings.tsx`
- `src/pages/YellowAlerts.tsx`

**Hooks:** `src/hooks/useStations.ts` (already exists).

**Supabase types:** `src/integrations/supabase/types.ts` (auto-generated; regenerate when schema changes).

**Frontend's claim discovery should query `dbt_dev.fct_passenger_journeys` directly:**
```sql
select *
from fct_passenger_journeys
where origin_stop_id = :origin
  and destination_stop_id = :dest
  and trip__start_date = :date
  and is_claimable = true
```

Never put threshold logic (the "20 minutes" rule) in the frontend. The fact pre-computes `is_claimable`; the UI consumes it.

**Status:** Both Index.tsx (at `/app`) and YellowAlerts.tsx (at `/delay-alerts`) now query `public.v_passenger_journeys` via `src/hooks/useJourneys.ts`. Index passes `onlyClaimable: false` (shows everything on the route); YellowAlerts passes `onlyClaimable: true`. The legacy edge function + corridor-collector pipeline was decommissioned (migration `20260519120000_decommission_live_departures_pipeline.sql`). All three pages' dropdowns are powered by `useStations()`.

**Theme directories** (`src/themes/<slug>/`): the home for per-region visuals. Each region directory holds a `theme.css` token override plus three SVG components (`HeroScene.tsx`, `SignupScene.tsx`, `Vehicle.tsx`). Future operator additions follow the same pattern: create `src/themes/<new-slug>/`, drop those four files, add a `pages/regions/<NewSlug>.tsx` that mirrors the Skånetrafiken page, register the route in `App.tsx`, add a card to `OperatorPicker.tsx`. The landing's base CSS (`src/themes/landing-base.css`) is the shared canvas.

---

## 8. Anti-patterns (do NOT do these)

- ❌ Reproduce the old broken "passenger delay" formula: `dest.arrival_delay - origin.arrival_delay`. This was rejected — it measures *delay accumulated en route*, not what passengers actually experience. v1 uses destination delay only. v2 (later) will model "could you have caught a better alternative."
- ❌ Use `CASE WHEN operator_id = 'X'` anywhere in dbt models. Rules belong in dim tables.
- ❌ Pre-compute every (user × delay × ticket) combination eagerly. User-side resolution stays lazy (Postgres function or app query). Operator-side facts are pre-computed.
- ❌ Use ingestion artifacts (`raw.id`, UUIDs) as the basis for surrogate keys. Must be hash of business keys.
- ❌ Run a self-join from the frontend against `fct_departures` per user request. The journey-leg fact is materialized for this exact reason.
- ❌ Auto-submit any claim to Skånetrafiken. Manual user review before submission, always. Skånetrafiken §1.10 says false claims will be polisanmäld.
- ❌ Apply Lovable-style auto-commits to dbt files. dbt logic is high-stakes and requires deliberate review. If an AI agent touched `models/marts/fct_departures.sql` autonomously, that's a bug.
- ❌ Treat the rebase ritual as routine. If git divergence keeps happening, the workflow is broken — fix the workflow (separate repos, branch separation, or disable Lovable GitHub sync).
- ❌ Reintroduce sams-id anywhere in new code. The legacy live-departures pipeline that used Trafiklab sams-id was retired. The frontend now speaks GTFS end-to-end. `SAMS_TO_GTFS` / `GTFS_TO_SAMS` in `shared/stops.ts` exist only as a one-way safety net for legacy URL bookmarks (`/delay-alerts?from=740000003`) — translate inbound, never emit.

---

## 9. Roadmap (sequenced)

Build in this order. Do not skip ahead without explicit user decision.

**v1 (now):**
- ✅ `fct_passenger_journeys` with hardcoded 20-min threshold
- ⏳ Frontend page: user selects origin + destination + date, sees claimable journeys
- ⏳ Frontend: claim filing workflow (collect user details, generate Skånetrafiken claim text)

**v1.5 — Correctness gaps:**
- 72-hour pre-announcement rule (Lag 2015:953). If service change was announced ≥3 dygn before scheduled departure, delay is measured against amended timetable, not original. Requires `snap_gtfs_static_trips` (dbt snapshot, SCD-2) and join logic. Currently produces false positives.
- `dim_stations` enrichment for the frontend (human-readable station names — most columns already present, verify completeness).
- Add a dbt `relationships` test linking `fct_passenger_journeys.origin_stop_id` and `destination_stop_id` → `dim_stations.stop__id`. Currently the FK relationship is convention-only; this test makes it auditable at `dbt test` time.
- Pagination on YellowAlerts.tsx claimable journeys list (current 500-row hard limit saturates as stations grow).
- Evaluate alternative dbt orchestrator if GitHub free-tier scheduled-action cadence (currently 1–4 hours between runs vs configured 15 min) becomes a problem. Easiest swap: **Render Cron Jobs** (free tier 100 hrs/month, very reliable, wrap dbt in a Dockerfile + 1 YAML). Other options: Modal (Python-native), Fly.io scheduled machines, or a self-hosted GitHub runner on always-on hardware. Edge functions and pg_cron cannot run dbt directly (Deno + Postgres SQL respectively; dbt is Python).
- ✅ ~~Revisit Index.tsx hypothesis.~~ Trigger fired: Index.tsx moved to `/app` behind auth; `/` now serves the marketing landing for signed-out visitors. Index's product role narrows from "front door" to "post-login dashboard."

**v2 — "Could you have caught a better alternative":**
- `user_journey_intents` table capturing recurring commute profile.
- Tolerant-window matching (±15 min, same stop pair) to determine effective passenger delay considering alternative trains.
- This is the right model for "5-min-later train saved the passenger" scenarios.

**v3 — Multi-operator / multi-jurisdiction:**
- `dim_compensation_rules` table (claim authority, route_km band, ticket product → threshold, tiers, valuation method).
- Bitemporal rule history (effective_period × system_period) for legally defensible historic re-evaluation.
- Polymorphic `ticket_type_valuation` (Skånetrafiken divisor, Västtrafik enkelbiljettpris, SL schablon).
- Immutable `claim_decisions` table with full JSONB rule snapshot per decision.

Do v3's architecture work only when operator #2 forces the abstraction. Premature abstraction guesses the shape wrong.

---

## 10. Known gaps

- **The 72-hour rule is not yet modeled.** v1 will produce false positives for trips with pre-announced service changes. Document this in user-facing UI ("Claim will be reviewed for pre-announced changes") until v1.5 lands.
- **Lovable auto-commits keep diverging from local.** Frontend changes made in Lovable's UI are pushed to GitHub automatically. The user has decided to stop using Lovable for code editing; verify Lovable's GitHub integration is disconnected before committing significant frontend work.
- **No analytics layer yet, by deliberate choice.** Metrics work is deferred until something usable ships. Don't volunteer dashboard work.
- **Data-freshness lag.** Ingestion to `raw_departures` is every 15 min, but downstream `fct_*` tables only update when `dbt build` runs via GitHub Actions — actual cadence 1–4 hours on free tier. A claimable journey ingested at 12:00 may not appear at `/delay-alerts` until 14:00 or later. Acceptable for the 60-day reklamation deadline, but worth knowing if user-perceived "live" matters later (see §9 v1.5 orchestrator alternatives).

---

## 11. Workflow & recovery SQL

- **Before editing dbt models:** `view` the existing file first. Understand the dedup logic, the grain, the filters, before changing anything.
- **Before any DDL change to Supabase:** propose the change, explain why, ask before applying. Use dbt migrations / `apply_migration` rather than ad-hoc `execute_sql` for DDL.
- **Commit messages:** descriptive imperatives. "Add fct_passenger_journeys, remove obsolete claimable_journeys" — not "Changes" or "checkpoint commit."
- **dbt commands the user should know:**
  - `dbt parse` — syntax check, doesn't touch the database.
  - `dbt run --select <model>` — builds one model.
  - `dbt test --select <model>` — runs tests for one model.
  - `dbt build --select <model>` — run + test in one go.
- **dbt deprecation:** wrap generic test arguments in `arguments:` key (dbt 2.x compatibility):
  ```yaml
  - dbt_utils.unique_combination_of_columns:
      arguments:
        combination_of_columns: [...]
  ```

### Debugging the scheduled dbt build

The workflow at `.github/workflows/dbt-run.yml` runs `dbt build` against the Supabase session pooler. If the frontend stops showing fresh journeys:

1. **Check recent Action runs** — GitHub repo → Actions → "dbt run". Failed runs show a red ✗; click in to see step output.
2. **Common failure modes:**
   - `Could not find a version that satisfies the requirement dbt-postgres==X.Y.Z` — pin in the workflow is wrong; check available versions on PyPI. The adapter version is **not** the same as dbt-core's version (see §3).
   - `connection refused` or `password authentication failed` — DB password rotated, or `SUPABASE_DB_*` secrets are stale. Get a fresh connection string from Supabase dashboard → Connect → Session pooler.
   - `prepared statement "X" already exists` — workflow is pointing at the **transaction pooler** (port 6543) instead of session pooler (5432). Fix the `SUPABASE_DB_HOST` / `SUPABASE_DB_PORT` secrets.
   - `relation "public.v_passenger_journeys" does not exist` after a `dbt run --full-refresh` — the dbt DAG should rebuild these, but check `dbt build` step output. If it persists, the §11 wrapper recreation SQL (below) is the manual fallback.
3. **Manually trigger a run** to test fixes: Actions → "dbt run" → Run workflow → main → Run workflow.
4. **Trigger from CLI:** `gh workflow run dbt-run.yml --repo Fakhravar1/claim-my-train`.


---

## 12. External references

- Trafiklab GTFS-RT docs: https://www.trafiklab.se
- Skånetrafiken särskilda villkor: regional reklamation rules
- Lag (2015:953) om kollektivtrafikresenärers rättigheter
- EU Regulation 2021/782 (long-distance rail rights, replaces 1371/2007 from 7 June 2023)
- Kimball, *The Data Warehouse Toolkit*, 3rd ed.: fact grain, conformed dims, late-arriving facts (Ch. 19), bus matrix incremental development
