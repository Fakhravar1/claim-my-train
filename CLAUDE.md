# CLAUDE.md — Claim My Train

Standing project context. Read at the start of every session.

---

## 1. What this project is

A Supabase + dbt + React frontend (hosted by Lovable) that automates train delay compensation claims for Swedish public-transport commuters.

**Hosting (important):** production frontend is served by **Lovable** at `https://claim-my-train.lovable.app` (canonical entry: `/regions/skanetrafiken/delay-alerts`). Lovable deploys from a **separate companion GitHub repo** it owns — `Fakhravar1/claim-my-train-ab5b0f74` — NOT the working repo `Fakhravar1/claim-my-train`. The two repos are not linked by Git. Keeping them in sync is handled by the `mirror-to-lovable` GitHub Action in this repo, which force-pushes working `main` to the companion on every push (see §11 "Publishing frontend changes to production" for the procedure and the manual fallback). If the mirror Action ever stops firing or the companion drifts ahead (e.g. Lovable AI commits there), prod silently runs different code from working main — that's the new failure mode (§10). Code editing in Lovable's web UI is no longer used — the companion repo is host-only, not an editing surface. The two-repo split is deliberate: the working repo holds Supabase secrets and runs backend CI (dbt), and Lovable AI has no commit access to it.

**MVP scope (current focus):** Malmö C ↔ Copenhagen H corridor, Skånetrafiken JoJo periodbiljett holders, regional regime (Lag 2015:953), 20-min delay threshold. Single operator (VR Sverige AB operating Öresundståg under Skånetrafiken contract).

**Out of scope until MVP ships:** Other corridors, other operators, EU 2021/782 jurisdiction flip (>150 km), taxi/annan-transport compensation path, multi-ticket-type valuation, force-majeure detection, Resplus, analytics dashboards.

**Sequencing principle:** Ship MVP first, then layer complexity. Do not abstract for hypothetical second operators before the first one works end-to-end.

**Frontend layout:** `/` is the marketing landing for signed-out visitors (`src/pages/Landing.tsx`); a `<ProtectedFromAuth>` wrapper redirects signed-in users to `/regions/skanetrafiken` (the departures cards page). The cards page itself is **public** — both `/regions/skanetrafiken` and `/regions/skanetrafiken/delay-alerts` are reachable without sign-in; claim filing still requires auth. There are no separate regional marketing pages anymore — `/regions/sl` and `/regions/vasttrafik` were dropped, and the OperatorPicker on the landing marks them inert "Coming soon" cards. The departures pages have their own design-system look (decorative Skåne weather band, cmt-* tokens) injected via `src/hooks/useAppShellStyles.ts` + `src/themes/regional-app-base.css`, scoped to the region routes so `/login` and `/settings` keep the shadcn theme. The landing keeps the older `src/hooks/useLandingStyles.ts` + `src/themes/landing-base.css` pair on the same scoping pattern. All routes that ship inline SVG payloads (landing, both region pages) are lazy-loaded.

**Frontend data path:** `SkanetrafikenApp.tsx` (at `/regions/skanetrafiken`) and `SkanetrafikenDelayAlerts.tsx` (at `/regions/skanetrafiken/delay-alerts`) query `public.v_passenger_journeys` (wrapper over `dbt_dev.fct_passenger_journeys`) via `src/hooks/useJourneys.ts`. Departures page passes `onlyClaimable: false`; delay-alerts passes `onlyClaimable: true`. The route card on both pages has a Date field that **defaults to today** and drives `useJourneys` `sinceDate` — we query a single day at a time, not the full 60-day window, so the initial payload is small. Dropdowns on those pages plus Settings are driven by `src/hooks/useStations.ts` (GTFS IDs from `public.v_active_stations`). The legacy live-departures plumbing (the `get-train-departures` edge function, the `claim-collection-15m` cron, and tables `departures` / `train_names` / `yellow_alert_history` / `claimable_corridor_windows` / `api_call_events` / `stations_master`) has been retired. The `SAMS_TO_GTFS` / `GTFS_TO_SAMS` maps in `shared/stops.ts` survive only for inbound URL-param normalization on legacy bookmarks (e.g. `?from=740000003` on the old `/delay-alerts` paths).

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
- **Frontend:** `src/` (React/TypeScript + Vite + Tailwind + shadcn/ui). Marketing landing at `/` (`src/pages/Landing.tsx`). Skåne departures board at `/regions/skanetrafiken` (`src/pages/regions/SkanetrafikenApp.tsx`), claimable delays at `/regions/skanetrafiken/delay-alerts` (`src/pages/regions/SkanetrafikenDelayAlerts.tsx`) — both public, both styled with the design-system look injected via `src/hooks/useAppShellStyles.ts` + `src/themes/regional-app-base.css`. `/regions/sl` and `/regions/vasttrafik` no longer exist; SL / Västtrafik appear as inert "Coming soon" cards on the landing's OperatorPicker. Shared region UI lives in `src/components/region/` (`SkaneBand.tsx`, `RegionDepartureCard.tsx`, `RegionUserMenu.tsx`). Landing CSS is scope-injected via `src/hooks/useLandingStyles.ts`. In-app shadcn theme in `src/index.css` is retuned to the Skåne palette (forest green + warm cream + sunflower) so `/login` / `/settings` feel continuous with the cards page.
- **Data source:** Trafiklab **Realtime APIs** — the REST departure/arrival boards at `realtime-api.trafiklab.se` (this is the stop-board REST product, **not** GTFS-RT; verified 2026-06-04 it uniquely covers cross-border København + all Swedish regions incl. Västtrafik/Halland, which the GTFS feeds lack). Ingested to `public.raw_departures` **hourly** by pg_cron job `collect-raw-departures-15m` (name is now stale — schedule was downgraded from `*/15` to `0 * * * *` because the API's realtime retention is generous enough), which POSTs to the `collect-raw-departures` Supabase edge function. A second pg_cron job `prune-raw-departures-10d` (daily `30 3 * * *`) deletes raw older than 10 days.
- **Auth:** Supabase Auth, user profiles in `public.profiles`.
- **Claim filing pipeline:** Python worker in `claim-worker/` (reportlab + pypdf) — polls `public.claims` for `status='pending'`, fills the Skånetrafiken reklamation PDF from the claim's journey snapshot + the user's `profiles` row, uploads it to the private `claims` Supabase Storage bucket, and flips the row to `generated` (or `error`). Runs on GitHub Actions (`.github/workflows/claim-pdf-worker.yml`, daily `0 6 * * *` + `workflow_dispatch`), using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` repo secrets (service-role key bypasses RLS — backend-only, never in the frontend). We chose GitHub Actions over Render here because **Render cron jobs are paid**, and Actions already hosts the dbt job. Generate-and-store only: no auto-submission to Skånetrafiken.

---

## 4. Repo structure

```
C:\Users\arian\trafiklab\          ← repo root
├── .github/
│   └── workflows/
│       ├── dbt-run.yml             ← scheduled dbt build on GitHub Actions
│       ├── claim-pdf-worker.yml    ← scheduled claim-PDF worker (daily)
│       └── mirror-to-lovable.yml   ← force-push working main → Lovable companion
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
│   │       ├── fct_departures.sql           ← stop-event grain (incremental table)
│   │       ├── fct_passenger_journeys.sql   ← journey-leg grain, v1 (VIEW — all O-D legs, lazy)
│   │       ├── fct_claimable_journeys.sql   ← claimable legs only (table; filter-before-join). See §13
│   │       ├── v_active_stations.sql        ← public wrapper view (dbt-managed, schema='public')
│   │       ├── v_passenger_journeys.sql     ← public wrapper view (dbt-managed, schema='public')
│   │       └── _marts.yml                   ← model tests & docs
│   ├── packages.yml                ← dbt_utils dependency
│   └── dbt_project.yml
├── claim-worker/                   ← Python claim-PDF worker (runs on GitHub Actions)
│   ├── worker.py                   ← polls pending claims → fill → upload → mark generated
│   ├── fill_template.py            ← overlays claim + profile data onto template.pdf
│   ├── template.pdf                ← blank Skånetrafiken reklamation form
│   └── requirements.txt            ← reportlab, pypdf, supabase, tzdata
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
  - `fct_passenger_journeys`: one row per (trip, start_date, origin_stop_id, destination_stop_id) where origin precedes destination in stop sequence. Journey-leg grain. **Now a VIEW** (see §13) — emits *all* O-D legs, read narrowly by the departures board.
  - `fct_claimable_journeys`: same journey-leg grain, but **claimable legs only** (delay ≥ 1200 s or cancelled). The durable discovery set behind the delay-alerts page + claim filing. See §13.
- **Surrogate keys:** every fact has one, generated from business keys via `dbt_utils.generate_surrogate_key([...])`. Never use ingestion artifacts (like raw row UUIDs) as the basis — must be deterministic from business keys.
- **Grain tests:** every fact has a `dbt_utils.unique_combination_of_columns` test on its natural grain. Grain violations = silent data corruption.
- **Degenerate dimensions:** business keys (trip_id, stop_id, etc.) live on the fact for traceability, alongside surrogate FKs to conformed dims.
- **Dedup at staging→fact boundary:** GTFS-RT publishes multiple updates per stop event; deduplicate with `row_number() over (partition by ... order by ingested_at desc) where rn = 1`. This is Kimball's late-arriving fact pattern (Toolkit Ch. 19).
- **No business-rule thresholds hardcoded in SQL when they're meant to be parameterized.** Current v1 hardcodes 20-min threshold; this gets refactored into `dim_compensation_rules` when we add operator #2 — not before.
- **No `CASE WHEN operator = '...'` branches in fact tables.** Operator-specific logic belongs in joined rule tables, not in fact SQL.
- **Rules attach to claim authority + route characteristics, NOT to operator.** Operator concessions change; rules don't. The "operator-agnostic fact" pattern means `fct_passenger_journeys` carries `agency__operator` as descriptive context only — never as a rule key.
- **Materialization strategy:** staging and dimensions are views; facts with expensive logic (dedup, self-joins) are tables with indexes on dominant query patterns. Per-model `{{ config(materialized='table') }}` in each file. Diagnose with `explain (analyze, buffers)` before changing materialization; never materialize speculatively. **Updated by the storage refactor (§13):** `fct_departures` is the materialized substrate (incremental table, ~70 d retention target); `fct_passenger_journeys` is now a **view** (the full all-pairs fan-out never hits disk — the board reads it narrowly by one O-D + date); `fct_claimable_journeys` is the only journey-grain **table**, kept small because claimable is delay-bounded (~1.5% of legs), not stops-bounded. Rationale: the quadratic all-pairs fan-out is what doesn't scale to ~1000 stops, so we only persist the tiny claimable slice.
- **Incremental facts:** `fct_departures` is `materialized='incremental'` (`delete+insert` on `departure_key`). A full rebuild scans all of `raw_departures` (EXPLAIN ANALYZE: ~79s, ~95% in the raw index scan, growing linearly with raw volume) — incremental cuts each run to the recently-active slice. **Incremental unit = the trip, not the row.** `stop_sequence` is a `row_number()` over `(trip__trip_id, trip__start_date)`, so it spans the whole trip; feeding it a partial trip silently misnumbers stops and corrupts the `fct_passenger_journeys` origin/destination pairing (verified: all 73k legs satisfy `origin_sequence < destination_sequence`, and `is_claimable` reads the delay off the sequence-selected destination row). The `is_incremental()` filter therefore selects whole trips touched since `max(ingested_at) - 1 hour`, never a flat row-level watermark. General rule: the incremental grain must be ≥ the coarsest key any window / aggregate / self-join spans.
- **Presentation-layer wrapper views** in `public` (`v_passenger_journeys`, `v_active_stations`, future additions) are dbt models with `schema='public'`. The custom `generate_schema_name` macro in `dbt/macros/` makes the `schema='public'` config land objects directly in `public` instead of the dbt-default `dbt_dev_public`. Wrappers are part of the dbt DAG (via `ref(...)`), so they rebuild automatically when underlying facts/dims change. No manual recreation needed after materialization changes.

---

## 6. Current state (v1, working as of latest commit)

**Dataflow (what auto-updates vs what doesn't):**

```
Trafiklab GTFS-RT
       │
       │ (pg_cron `collect-raw-departures-15m`, now HOURLY `0 * * * *`,
       │  POSTs to collect-raw-departures edge function)
       ▼
public.raw_departures (table — cron writes here)
       │
       │ stg_departures (view — live, recomputes on every SELECT)
       │
       │ (dbt build, every ~15 min via GitHub Actions —
       │  in practice 1–4 hours apart due to GH scheduling jitter)
       ▼
dbt_dev.fct_departures (incremental table — the materialized substrate)
dbt_dev.fct_passenger_journeys (VIEW — recomputes the all-O-D self-join on each SELECT)
dbt_dev.fct_claimable_journeys (table — claimable legs only)
dbt_dev.dim_active_stations (table)
       │
       │ public.v_passenger_journeys, public.v_active_stations
       │ (dbt-managed views — reads of these resolve to the underlying
       │  fct_departures table, so freshness = "last dbt build" not "last raw insert")
       ▼
Frontend (useStations, useJourneys hooks via Supabase JS client)
```

**Critical fact about freshness:** dimension and staging models are views (always live), and `fct_passenger_journeys` is now a view too — but a view is only as fresh as the **table it reads**, and it reads `fct_departures`, which is a materialized incremental table (stale until the next `dbt build` runs). So freshness is still gated on `dbt build`: the frontend cannot show a journey until the scheduled Action has processed the new raw row into `fct_departures`. `fct_claimable_journeys` and `dim_active_stations` are likewise tables refreshed only by `dbt build`. Currently 1–4 hours of GH scheduling drift between ingest and visibility (the cause of the "no afternoon departures" symptom — last build sets the visible horizon).

**Working:**
- `raw_departures` ingestion from Trafiklab GTFS-RT via the `collect-raw-departures` edge function. Keep the deployed copy and `supabase/functions/collect-raw-departures/index.ts` in sync — drift between them is what masked the May 2026 Triangeln incident (§10). The table's unique constraint is `(trip__trip_id, trip__start_date, stop__id, scheduled, ingested_at, event_type)`. `event_type` MUST stay in both the constraint and the function's `onConflict` argument, otherwise arrival rows for intermediate stops collide with the same-trip departure row in the same upsert batch and get silently dropped by `ignoreDuplicates: true`.
- Scheduled `dbt build` via `.github/workflows/dbt-run.yml` keeps `fct_*` and `dim_active_stations` tables fresh. Triggers: `schedule: */15` + `workflow_dispatch` (for manual runs from the Actions tab). Logs visible per-run in the GitHub Actions UI.
- `stg_departures` cleaning layer.
- `fct_departures` (incremental, `delete+insert` on `departure_key`) carries indexes on dominant query patterns: `(trip__trip_id, trip__start_date, event_type, stop_sequence)` and `(event_type, stop__id)`. The composite includes `event_type` so the planner avoids re-filtering during the journey self-join. **`fct_passenger_journeys` no longer carries indexes** — it's a view now (§13); its read performance comes from the date filter keeping the recomputed self-join tiny, plus `fct_departures`'s own indexes. The set of indexes the *old* `fct_passenger_journeys` table held [`(trip__start_date)`, `(origin_local_date)`, `(origin_stop_id, destination_stop_id, origin_local_date)`, `(origin_stop_id, destination_stop_id, trip__start_date)`, `(is_claimable)`] is the candidate set for `fct_claimable_journeys` if/when its read patterns warrant it (currently tiny, ~1,188 rows, so unindexed is fine).
- **`trip__start_date` vs `origin_local_date` on `fct_passenger_journeys`.** Different concepts, distinction is load-bearing:
  - `trip__start_date` is the **GTFS service date** — degenerate dimension kept on the fact for traceability back to the feed. For a service "starting on the 23rd," GTFS-RT can include trips that physically run after midnight (e.g. 00:38 on the 24th Stockholm time).
  - `origin_local_date` is `(origin.scheduled at time zone 'Europe/Stockholm')::date` — the **calendar day the origin departure physically runs**, in Stockholm local time. This is what end users mean when they pick a date in the picker.
  - The frontend filters on `origin_local_date`, not `trip__start_date`. Filtering on `trip__start_date` produced a "picked the 24th, top card says 25 May" bug: service-24 trips that run on the 25th sorted first (descending by `origin_scheduled`) and led the list.
  Frontend query time was ~6s when the board scanned an unmaterialized all-journeys path; it is kept low now by the narrow one-O-D-plus-date filter against the `fct_passenger_journeys` view, which bounds the recomputed self-join (the board does NOT scan all journeys). Claim discovery + the delay-alerts page read the small `fct_claimable_journeys` table instead.
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
- Frontend hooks `useStations` (`src/hooks/useStations.ts`) and `useJourneys` (`src/hooks/useJourneys.ts`) consume the public wrappers. SkanetrafikenApp.tsx, SkanetrafikenDelayAlerts.tsx, and Settings.tsx all use `useStations` for dropdowns; the two region pages use `useJourneys` for the journey lists (departures with `onlyClaimable: false`, delay-alerts with `onlyClaimable: true`). Both region pages default the date filter to today and pass it as `sinceDate`.
- `shared/stops.ts` includes a `SAMS_TO_GTFS` / `GTFS_TO_SAMS` translation map bridging Trafiklab sams-id (legacy `get-train-departures` edge function imports) and GTFS (everything in dbt and the frontend). Only used for inbound URL-param normalization on the region pages, for legacy bookmarks that pre-date the GTFS migration.
- ✅ Marketing landing page at `/` (`src/pages/Landing.tsx`). Skåne departures + claimable-delays pages at `/regions/skanetrafiken` and `/regions/skanetrafiken/delay-alerts`. SL and Västtrafik no longer have routes; they appear as inert "Coming soon" cards on the landing's OperatorPicker. `src/themes/skanetrafiken/theme.css` carries the Skåne token overrides (Pågatåg purple, rapeseed yellow); the per-region marketing SVGs (`HeroScene.tsx`, `SignupScene.tsx`, `Vehicle.tsx`) were dropped when the regional marketing pages were removed. Decorative band SVG for the region cards page lives in `src/components/region/SkaneBand.tsx`. Region CSS is injected via `src/hooks/useAppShellStyles.ts` so it doesn't bleed into the shadcn theme on `/login` and `/settings`.
- ✅ **Claim filing, end-to-end.** `public.claims` table (one row per filed claim, carries a snapshot of the journey so it's independent of later dbt rebuilds). RLS: `insert`/`select` own rows (`auth.uid() = user_id`); unique on `(user_id, journey_key, trip_start_date)`; `status` defaults `'pending'`; columns include `pdf_path`, `generated_at`, `submitted_at`, `error_message`, `delay_bucket`. The "Start claim" → confirm dialog on `SkanetrafikenDelayAlerts.tsx` inserts via `src/hooks/useStartClaim.ts`; the dialog shows the full claim payload (journey + compensation tier + all personal fields from the profile) and blocks submit if any required profile field is missing. The `claim-worker/` (see §3) then generates the PDF to the `claims` Storage bucket.
- ✅ **Duplicate guardrail (two layers).** Hard backstop: the unique `(user_id, journey_key, trip_start_date)` constraint + `useStartClaim` catching `23505`. Proactive: `SkanetrafikenDelayAlerts.tsx` loads the user's claims via `src/hooks/useMyClaims.ts` and renders a disabled "✓ Claim filed" button (instead of "Start claim") for any departure whose `journey_key` is already claimed; the list invalidates `["my-claims"]` after a successful submit.
- ✅ **Claim tracking.** "My claims" tab in `src/pages/Settings.tsx` (via `useMyClaims`) shows, per claim: the **stored journey snapshot** that was filed (route, travel date, scheduled departure/arrival, actual arrival, compensation tier), the pipeline `status` badge (pending / form ready / submitted / error), and **user-set outcome** controls — **Paid out** / **Denied** / Clear. Outcome lives in a separate `public.claims.outcome` column (`text check (outcome in ('paid_out','denied'))`, nullable) so it doesn't collide with the worker-managed `status`. Setting it needs a claims **UPDATE** RLS policy (`for update to authenticated using/with check auth.uid() = user_id`). Personal fields (name, personnummer, address, payout) are **not** snapshotted per-claim — they're read from `profiles` when the worker generates the PDF, so the tab notes that. **No PDF download in the UI** (the form holds personnummer; we deliberately don't surface it client-side). `useMyClaims.Claim` widens the generated type with `outcome` since `types.ts` predates the column — regenerate types on the next schema sync to drop the widening. The earlier "Users can read own claim PDFs" Storage policy is now unused by the frontend (harmless to keep).
- ✅ **Settings is the claim profile.** `public.profiles` gained `first_name`, `last_name`, `payout_method` (`bank`/`sms`/`email`, CHECK-constrained), plus `street_address` / `postal_code` / `city`. `src/pages/Settings.tsx` validates everything client-side (`src/lib/claimProfileValidation.ts`: personnummer Luhn + date, intl-or-Swedish mobile, postal code, email) and makes the claim-identity fields mandatory. `profiles` RLS now has an `insert` policy + `with_check` on `update` (`auth.uid() = id`) — without the insert policy the Settings `upsert` was silently rejected.

**Data volume (verified 2026-06-01):** `raw_departures` ~571k rows / 303 MB; `fct_departures` ~100k rows / 30 MB (deduped — raw is ~10× the fact); `fct_passenger_journeys` ~73k legs / 22 MB. Three operators present: VR Sverige AB (Öresundståg, 880 trips), Pågatåg (1,866 trips), SJ AB (7 trips).

---

## 7. Frontend approach

The frontend was being built in Lovable's UI, then partially via Cursor. Now being taken over via Claude Code. The user wants to STOP Lovable's auto-commit interfering with our work.

**Pages:**
- `src/pages/Landing.tsx` — marketing landing at `/`
- `src/pages/regions/SkanetrafikenApp.tsx` — Skåne departures cards page at `/regions/skanetrafiken`
- `src/pages/regions/SkanetrafikenDelayAlerts.tsx` — claimable delays at `/regions/skanetrafiken/delay-alerts`
- `src/pages/Settings.tsx`, `src/pages/Login.tsx`, `src/pages/NotFound.tsx`

**Hooks:** `src/hooks/useStations.ts`, `src/hooks/useJourneys.ts`, `src/hooks/useAppShellStyles.ts` (region pages), `src/hooks/useLandingStyles.ts` (landing).

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

**Status:** Both `SkanetrafikenApp.tsx` (at `/regions/skanetrafiken`) and `SkanetrafikenDelayAlerts.tsx` (at `/regions/skanetrafiken/delay-alerts`) query `public.v_passenger_journeys` via `src/hooks/useJourneys.ts`. Departures page passes `onlyClaimable: false` (shows everything on the route); delay-alerts passes `onlyClaimable: true`. The legacy edge function + corridor-collector pipeline was decommissioned (migration `20260519120000_decommission_live_departures_pipeline.sql`). All three pages' dropdowns are powered by `useStations()`.

**Claim filing (implemented).** The confirm dialog inserts a `pending` row into `public.claims` via `useStartClaim`; the `claim-worker/` generates the filled PDF (§3, §6). The old **autofill-bot path is removed** — `scripts/claim-bot.js` (Playwright), the `claim-assistant` edge function, the `claim-bot` npm script, and the `playwright` dep are all deleted. There's still a non-bot "Or open the official form" link (`CLAIM_START_URL`) as a manual fallback.

**Cross-midnight rendering.** `RegionDepartureCard.tsx` derives delay/duration from `HH:MM` strings, so it `wrapHalfDay()`-normalizes any clock difference into ±12h — otherwise a leg arriving `23:48 → 00:11 (next day)` rendered as `-1417 min` / `0 min` duration instead of `+23 min` / `66 min`. Don't reintroduce raw `actual - scheduled` clock subtraction here.

**Theme + region-component layout:**
- `src/themes/landing-base.css` — base CSS tokens (cmt-* palette, Fraunces/Inter type) used by the landing.
- `src/themes/regional-app-base.css` — shell CSS for region departures pages (decorative band, app-shell, app-card, dep card v2 layout). Injected via `useAppShellStyles()`.
- `src/themes/skanetrafiken/theme.css` — region-specific token overrides (Pågatåg purple, rapeseed yellow). Loaded as `extra` argument to `useAppShellStyles()`.
- `src/components/region/` — shared region UI (`SkaneBand.tsx`, `RegionDepartureCard.tsx`, `RegionUserMenu.tsx`).

**Pattern for adding a new operator's departures page (e.g. SL when ready):**
1. Create `src/themes/sl/theme.css` with the SL palette overrides.
2. (Optional) Add a decorative band SVG component in `src/components/region/`, e.g. `SLBand.tsx`.
3. Copy `SkanetrafikenApp.tsx` → `SLApp.tsx`, swap the theme CSS import and the band component, point `useAppShellStyles()` at the new theme.
4. Register `/regions/sl` and `/regions/sl/delay-alerts` in `App.tsx`.
5. Convert the inert "Coming soon" card in `OperatorPicker.tsx` back into a `<Link>`.

---

## 8. Anti-patterns (do NOT do these)

- ❌ Reproduce the old broken "passenger delay" formula: `dest.arrival_delay - origin.arrival_delay`. This was rejected — it measures *delay accumulated en route*, not what passengers actually experience. v1 uses destination delay only. v2 (later) will model "could you have caught a better alternative."
- ❌ Use `CASE WHEN operator_id = 'X'` anywhere in dbt models. Rules belong in dim tables.
- ❌ Pre-compute every (user × delay × ticket) combination eagerly. User-side resolution stays lazy (Postgres function or app query). Operator-side facts are pre-computed.
- ❌ Use ingestion artifacts (`raw.id`, UUIDs) as the basis for surrogate keys. Must be hash of business keys.
- ❌ Run a self-join from the frontend against `fct_departures` per user request. The journey-leg fact is materialized for this exact reason.
- ❌ Auto-submit any claim to Skånetrafiken. Manual user review before submission, always. Skånetrafiken §1.10 says false claims will be polisanmäld. The `claim-worker` only **generates and stores** a filled PDF (`status='generated'`); it never submits. The Playwright autofill bot that *did* drive the official form was deliberately removed — don't resurrect it as an auto-submit step.
- ❌ Apply Lovable-style auto-commits to dbt files. dbt logic is high-stakes and requires deliberate review. If an AI agent touched `models/marts/fct_departures.sql` autonomously, that's a bug.
- ❌ Treat the rebase ritual as routine. If git divergence keeps happening, the workflow is broken — fix the workflow (separate repos, branch separation, or disable Lovable GitHub sync).
- ❌ `git add -A` / `git add .` when staging. The repo was scaffolded with `node_modules/`, `venv/`, `dbt/.venv/`, `dist/`, and `supabase/.temp/` **committed**, and `.gitignore` only applies to *untracked* files — so a blanket add re-stages thousands of dependency/build files (and the LF→CRLF warning flood is the symptom). These were untracked on 2026-06-01 (`git rm -r --cached`, files left on disk) and added to `.gitignore`. Stage explicitly by path. Critical reason: the `mirror-to-lovable` Action force-pushes the **whole** repo to the companion, so anything junk in the working tree ships to prod's host repo too.
- ❌ Reintroduce sams-id anywhere in new code. The legacy live-departures pipeline that used Trafiklab sams-id was retired. The frontend now speaks GTFS end-to-end. `SAMS_TO_GTFS` / `GTFS_TO_SAMS` in `shared/stops.ts` exist only as a one-way safety net for legacy URL bookmarks (e.g. `?from=740000003` on the old `/delay-alerts` path or its `/regions/skanetrafiken/...` successor) — translate inbound, never emit.

---

## 9. Roadmap (sequenced)

Build in this order. Do not skip ahead without explicit user decision.

**v1 (now):**
- ✅ `fct_passenger_journeys` with hardcoded 20-min threshold
- ✅ Frontend page: user selects origin + destination + date, sees claimable journeys
- ✅ Frontend: claim filing workflow — confirm dialog inserts a `pending` claim; `claim-worker` fills the Skånetrafiken PDF and stores it (§3, §6). Remaining: a way for users to download/view their generated PDF, and the future "submit" step (Writer 3 / Ekopost), still deliberately manual.

**v1.5 — Correctness gaps:**
- 72-hour pre-announcement rule (Lag 2015:953). If service change was announced ≥3 dygn before scheduled departure, delay is measured against amended timetable, not original. Requires `snap_gtfs_static_trips` (dbt snapshot, SCD-2) and join logic. Currently produces false positives.
- `dim_stations` enrichment for the frontend (human-readable station names — most columns already present, verify completeness).
- Add a dbt `relationships` test linking `fct_passenger_journeys.origin_stop_id` and `destination_stop_id` → `dim_stations.stop__id`. Currently the FK relationship is convention-only; this test makes it auditable at `dbt test` time.
- Pagination on `SkanetrafikenDelayAlerts.tsx` claimable journeys list (current 500-row hard limit in `useJourneys` saturates as stations grow). Less urgent now that the date filter defaults to a single day — but still a real ceiling when a user picks a date with high traffic.
- Evaluate alternative dbt orchestrator if GitHub free-tier scheduled-action cadence (currently 1–4 hours between runs vs configured 15 min) becomes a problem. Note: **Render cron jobs are paid** (an earlier version of this doc wrongly called them free) — that's why the `claim-worker` runs on GitHub Actions, not Render. Free options if Actions ever falls short: Modal (Python-native, generous free credits), PythonAnywhere (1 free daily task), Google Cloud Run Jobs + Cloud Scheduler, or a self-hosted runner. Edge functions and pg_cron cannot run dbt/Python orchestration directly (Deno + Postgres SQL respectively).
- ✅ ~~Revisit Index.tsx hypothesis.~~ Resolved: `Index.tsx` (at `/app`) was replaced by `SkanetrafikenApp.tsx` (at `/regions/skanetrafiken`). The page is now public — discovery doesn't require auth, only claim filing does. Signed-in visitors of `/` still get bounced to the cards page via `<ProtectedFromAuth>`, but the redirect target is now the region URL.

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
- **`fct_departures` `--full-refresh` is now a LIVE destructive hazard (raw is only 10 days).** Since `prune-raw-departures-10d` is live (next entry), raw no longer holds full history. In normal operation `fct_departures` keeps growing well past 10 days (incremental delete+insert only touches recently-active trips, never deletes old rows), so the fact accumulates the ~70-day window §13 wants. **But a `--full-refresh` rebuilds `fct_departures` from only the surviving ~10 days of raw and permanently drops everything older** — collapsing the fact to the raw horizon. This breaks claim derivation for the 60-day reklamation window. So: never `--full-refresh fct_departures` expecting history; if a rebuild is truly needed, accept the 10-day floor or repopulate raw first. (This was a future risk before; with the 10-day prune live it is present.)
- **Raw retention now ENFORCED at 10 days** (pg_cron `prune-raw-departures-10d`, daily `30 3 * * *`, deletes `ingested_at < now() - interval '10 days'`). Verified live 2026-06-04: raw holds ~108k rows / ~10 days, down from the earlier unbounded 303 MB / 571k. The storage refactor (§13) had proposed a ~3-day buffer; implemented at 10 days, which comfortably covers the incremental lookback and stays small pre-Pro. (At the ~1000-stop expansion target, 10 d of raw scales up — revisit the horizon then; the old 70-day plan projected to **~7 GB**, which is why raw stays short.) The `(ingested_at)` btree index (added 2026-06-01, migration `20260601120000_add_raw_departures_ingested_at_index.sql`) makes both the prune and the incremental filter index-scannable. Secondary lever: ~31% of raw row width is denormalised text labels (`route__name`, stop/route/agency names), re-derivable from dims by id, prunable when the ingestion path is next touched.
- **Lovable host repo is decoupled from the working repo.** Production is served by Lovable from a companion repo (`Fakhravar1/claim-my-train-ab5b0f74`) that is *not* a Git remote of the working repo. The `mirror-to-lovable` GitHub Action keeps the companion's `main` in sync on every push, so this is no longer a foot-gun in normal operation. Two residual risks: (a) if the mirror Action fails silently or GitHub throttles its triggers, prod runs stale code — periodically eyeball the Actions tab; (b) if Lovable AI ever commits to the companion, the next mirror push fails as non-fast-forward — a loud tripwire, but it means someone has to investigate the divergence before the next deploy can land. Manual mirror procedure in §11 is the fallback.
- **No analytics layer yet, by deliberate choice.** Metrics work is deferred until something usable ships. Don't volunteer dashboard work.
- **Possibly-orphaned `claim-assistant` edge function.** Its source was deleted from the repo, but the *deployed* function may still be ACTIVE on Supabase (delete with `supabase functions delete claim-assistant --project-ref jnfwmdirvnqfpfhtipld`). Harmless while it lingers — nothing calls it — but it's dead weight tied to the removed bot path. Verify and delete if still present.
- **`dbt/models/marts/fct_claims.sql` is untracked.** It sits in the working tree but isn't committed. The live claim path uses the `public.claims` *app table* (written by the frontend + worker), **not** a dbt model — recall claims are deliberately not dbt-managed (a `dbt run` would drop the table). Decide whether `fct_claims` is a real analytics model or leftover scaffolding before committing it.
- **Data-freshness lag.** Ingestion to `raw_departures` is hourly (pg_cron `0 * * * *`, downgraded from 15 min — the realtime API retains realized values long enough that hourly sampling is acceptable for the 60-day horizon), but downstream `fct_*` tables only update when `dbt build` runs via GitHub Actions — actual cadence 1–4 hours on free tier. A claimable journey ingested at 12:00 may not appear at `/regions/skanetrafiken/delay-alerts` until 14:00 or later. Acceptable for the 60-day reklamation deadline, but worth knowing if user-perceived "live" matters later (see §9 v1.5 orchestrator alternatives).
- **Triangeln arrivals 2026-05-19 → 2026-05-26 are permanently missing.** Trafiklab tightened `/arrivals/740001587` and `/departures/740001587` to return identical `scheduled` values for the same trip at this instantaneous pass-through stop. The edge function's upsert used `ignoreDuplicates: true` with a `onConflict` key that omitted `event_type`, so for each colliding pair the departure (pushed first) won and the arrival was silently dropped. Triangeln arrival counts collapsed from ~1,700 trips/day to ~10–30/day, which made any journey *terminating* at Triangeln (Malmö C → Triangeln, Hyllie → Triangeln) disappear from `fct_passenger_journeys` while reverse directions stayed healthy. Fixed on 2026-05-26 by adding `event_type` to both the unique constraint and the function's `onConflict` (migration `20260526150000_fix_raw_departures_unique_constraint.sql`, function v14). The realtime feed only retains a short window so the missing rows cannot be backfilled — affected journeys will read as low-volume until those dates age out of the 60-day display horizon. The dbt singular test `tests/assert_arrival_departure_ratio_per_stop.sql` exists to catch any future per-stop, per-event-type collapse on the next `dbt build`.

---

## 11. Workflow & recovery SQL

- **Before editing dbt models:** `view` the existing file first. Understand the dedup logic, the grain, the filters, before changing anything.
- **Before any DDL change to Supabase:** propose the change, explain why, ask before applying. Use dbt migrations / `apply_migration` rather than ad-hoc `execute_sql` for DDL.
- **Migration workflow (decided — Option A).** The `supabase_migrations.schema_migrations` history is drifted: the same logical migrations exist locally and remotely under *different* timestamps (dashboard/Lovable stamped its own), plus older remote-only entries with no local files. So **the Supabase CLI `db push` / `db pull` are knowingly broken — do not run them.** The apply path is: run DDL in the Supabase **dashboard SQL editor**, then **record it as a file in `supabase/migrations/`** purely for the repo's honesty (these files are documentation; they are *not* replayed via the CLI, and re-running them would error since the objects already exist). The live database is the source of truth, not the migrations folder. Escape hatch if CLI-driven deploys are ever actually needed (Option B): archive the existing migration files, `supabase db pull` to snapshot the live schema as one fresh baseline, then let the CLI re-sync — do it as its own session with a backup first. Don't attempt to untangle the ~25 drifted history rows by hand.
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
- **dbt test patterns in this repo (both styles exist; pick the right one).**
  - *Schema tests* in `dbt/models/marts/_marts.yml` next to the model — for one-column / one-property invariants (`unique`, `not_null`, `dbt_utils.unique_combination_of_columns` on grain). These are structural.
  - *Singular tests* as standalone `.sql` files in `dbt/tests/` — for content invariants that span rows or columns. **Contract: zero rows returned = PASS, any rows = FAIL.** Write the SELECT that finds violations, not the SELECT that proves correctness. Example: `tests/assert_arrival_departure_ratio_per_stop.sql` flags any (stop, day) where `least(arr, dep) / greatest(arr, dep) < 0.10` and the larger side is ≥100 events — designed to catch the Triangeln-style collapse described in §10 on the next scheduled `dbt build`. Invoke with `dbt test --select <test_name>` (without `.sql`). Both styles run together under `dbt test` and `dbt build`, and CI in `.github/workflows/dbt-run.yml` already executes them.

### Publishing frontend changes to production

Production is hosted by Lovable from the companion repo `Fakhravar1/claim-my-train-ab5b0f74`. Pushes to `Fakhravar1/claim-my-train` main do **not** directly redeploy prod — they go through the mirror.

**Automated path (normal operation):**

The `mirror-to-lovable` workflow (`.github/workflows/mirror-to-lovable.yml`) runs on every push to working `main`. It pushes the whole repo to the companion's `main` using a fine-grained PAT stored in the `LOVABLE_MIRROR_PAT` repo secret, scoped to the companion repo only (so a leak can't touch the working repo) with **both** `Contents: Read and write` **and** `Workflows: Read and write`. The Workflows permission is mandatory: GitHub rejects any push that creates/updates a `.github/workflows/*` file with a token lacking it — `! [remote rejected] ... refusing to allow a Personal Access Token to create or update workflow ... without 'workflow' scope`. We hit this when `claim-pdf-worker.yml` was first added; once a workflow file is on working main, *every* subsequent mirror push re-sends it, so a missing Workflows permission jams the mirror for all pushes, not just the one that touched a workflow. Editing a fine-grained token's permissions keeps the same token value, so the secret needs no change. Lovable picks up the push and redeploys within ~1–2 min. Verify at `https://claim-my-train.lovable.app/regions/skanetrafiken/delay-alerts`.

After any frontend-affecting commit hits main, glance at the Actions tab and confirm the latest `Mirror to Lovable` run is green.

**Manual fallback** (use if the Action fails, is disabled, or GitHub's trigger plane is misbehaving):

One-time setup — add the companion repo as a second remote:
```powershell
git remote add lovable https://github.com/Fakhravar1/claim-my-train-ab5b0f74.git
git fetch lovable
```

Then mirror current main:
```powershell
git push lovable main:main
```

**Notes and edge cases:**
- We mirror the whole repo, not just `src/`. Lovable's build needs `package.json`, `vite.config.ts`, `index.html`, theme CSS, etc., and we want workflow-file changes to reach the companion too (see the `if: github.repository == ...` guard on `dbt-run.yml` — without that, the companion's copy of the dbt workflow would fire on schedule with no Supabase secrets and fail every 15 min; the guard is what keeps the companion quiet).
- Backend-only changes (dbt models, Supabase migrations, edge functions, GH Actions) still mirror, but Lovable will only redeploy when the built bundle actually changes — backend commits produce no-op redeploys.
- If `git push lovable` (or the Action) is rejected as non-fast-forward, the companion has been edited out-of-band — most likely Lovable's AI committed something. Don't force-push past it; review the divergent commits first. That's the §10 tripwire.
- The companion's own `dbt-run.yml` workflow has been disabled via `gh workflow disable` on top of the repo guard. If you ever need to re-enable backend CI on the companion (you shouldn't), both layers would need to be undone.
- Long-term alternatives if this stack becomes painful: (a) move hosting to Vercel/Netlify off the working repo and retire the companion; (b) keep the current setup. Re-pointing Lovable at the working repo isn't an option — Lovable's docs confirm reconnecting always creates a new repo, never links to an existing one.

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

- **`fct_departures` incremental ops.** Normal run `dbt run -s fct_departures` (sub-second; processes trips active since `max(ingested_at) - 1h`). Recovery from grain corruption or first build: `dbt build --full-refresh -s fct_departures` (full ~79s rebuild; lossless only while raw retention covers the needed window — §10). The `(ingested_at)` index on `raw_departures` is an **imperative** migration in `supabase/migrations/` — not dbt-managed (raw isn't a dbt model), so dbt never touches it; the `indexes=[...]` on the model are dbt-managed and recreated on full-refresh.

### Debugging the claim PDF worker

The `claim-worker/` (§3) runs via `.github/workflows/claim-pdf-worker.yml`. Trigger manually with `gh workflow run claim-pdf-worker.yml --repo Fakhravar1/claim-my-train`; check rows with `select id, status, pdf_path, error_message from public.claims order by created_at desc;`.

1. **Nothing happens / no pending rows:** the worker only processes `status='pending'`. Submit a claim in the app, or reset a test row: `update public.claims set status='pending', pdf_path=null, generated_at=null, error_message=null where id='…';`. Note the unique `(user_id, journey_key, trip_start_date)` — re-claiming the same journey returns `23505` and the dialog says "already started a claim."
2. **`ModuleNotFoundError: No module named 'tzdata'` / `ZoneInfoNotFoundError: Europe/Stockholm`:** Windows has no system tz DB; `tzdata` is in `requirements.txt` for this reason (harmless on the Linux runner). Local fix: `pip install tzdata`.
3. **`KeyError: 'SUPABASE_URL'` / auth errors:** the `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` repo secrets are missing/stale. The DB-pooler secrets used by dbt do **not** work here — the worker uses the REST + Storage API, which needs the project URL + service-role key.
4. **Row stuck in `error`:** read `error_message`. "Orphaned claim — no matching profile" means the `profiles` row for that `user_id` is gone. PDF field drift (wrong checkbox, off-by-one personnummer cell) is tuned in `claim-worker/fill_template.py` against `template.pdf` — download a generated PDF from the `claims` bucket and eyeball before trusting coordinates.
5. **Local dry run:** from `claim-worker/`, `pip install -r requirements.txt`, set the two env vars, `python worker.py`.

### Repo hygiene

- **`.gitignore` is authoritative** and covers: `node_modules/`, `venv/` + `.venv/` (`**/venv/`, `**/.venv/` — dotted and undotted, any depth), `dist/`, `target/`, `dbt_packages/`, `logs/`, `supabase/.temp/` (+ `supabase/.temp/**`) and `supabase/.branches/`, editor settings (`.vscode/settings.json`, `.claude/settings.local.json`, `.claude/worktrees/`), `*.session.sql`, and `.env*` (secrets safety net — never commit). All of these except env/editor files were **tracked in the original Lovable scaffold** and were untracked on 2026-06-01 via `git rm -r --cached` (left on disk).
- **Mental model:** `.gitignore` is consulted only for *untracked* files. To stop tracking something already committed, untrack first (`git rm --cached <path>`), *then* ignore — adding a `.gitignore` line alone does nothing to an already-tracked path. Verify with `git check-ignore <path>` (point it at a real file inside a dir, e.g. `supabase/.temp/cli-latest`, not the bare dir — the bare-dir probe can misreport).
- **`dbt/package-lock.yml` is intentionally tracked** (pins `dbt_utils` — see §3). It shows transient diffs because local dbt 1.11.8 and CI dbt ~1.10.x each rewrite its format on `dbt deps`; that churn is noise. `git restore dbt/package-lock.yml` to discard it — don't commit the flip-flop, and don't add it to `.gitignore`.
- Machine-local files untracked 2026-06-01 (now ignored): `.claude/settings.local.json`, `.vscode/settings.json`, `trafiklab.session.sql`.


---

## 12. External references

- Trafiklab GTFS-RT docs: https://www.trafiklab.se
- Skånetrafiken särskilda villkor: regional reklamation rules
- Lag (2015:953) om kollektivtrafikresenärers rättigheter
- EU Regulation 2021/782 (long-distance rail rights, replaces 1371/2007 from 7 June 2023)
- Kimball, *The Data Warehouse Toolkit*, 3rd ed.: fact grain, conformed dims, late-arriving facts (Ch. 19), bus matrix incremental development

---

## 13. Storage architecture refactor (in progress — folded in from handover 2026-06-02)

A multi-step storage redesign driven by the ~1000-stop expansion target (the current ~9-stop slice already showed ~91 stations; full Skåne train network ~1000). Capturing it here so the partial state is recoverable.

### The problem it solves
- **raw_departures** at the old 70-day retention projects to **~7 GB** at 1000 stops (poll-snapshot bloat) — blows the Pro ceiling.
- **fct_passenger_journeys** is an all-O-D self-join; legs scale with **stops-per-trip squared** (legs ≈ C(stops,2); empirically avg 4.21 stops/trip → 8.01 legs/trip vs predicted C(n,2)=8.47). At 1000 stops with full routes this is multi-GB.
- Only **~1.56% of legs are ever claimable** (1,188 of ~75k), concentrated in 95 of 9,416 trip-days. Persisting all legs to keep ~1.5% is the waste.
- Key correction made during design: "fct will get huge" was inverted — **raw is ~10× fct_departures** (303 MB vs 30 MB; 571k vs 100k rows), because dedup collapses redundant polls. **Raw is the bloat lever, not fct.**

### Target architecture (agreed) — three tiers by retention, each derivable from the tier below
- **raw_departures** → SHORT buffer. Planned ~3 days; **implemented at 10 days** (pg_cron `prune-raw-departures-10d`, live as of 2026-06-04). Covers the incremental lookback with margin. (See §10.)
- **fct_departures** → SUBSTRATE, ~70 days. **NON-NEGOTIABLE:** retention must cover the 60-day reklamation deadline + margin, because claimable legs must stay *derivable* as long as a user can still file. Shortening it below ~70 d silently breaks claim filing.
- **fct_passenger_journeys** → VIEW (no storage). Lazy all-pairs, read narrowly (one O-D + date) by the departures board. Quadratic fan-out never hits disk.
- **fct_claimable_journeys** → thin TABLE, ~70 days. The durable discovery set. Tiny (~140 MB even at 1000 stops) because claimable is delay-bounded, not stops-bounded.

### DONE (committed)
- `fct_departures` incremental (delete+insert on `departure_key`, trip-grain `is_incremental()` filter, 1 h lookback). Verified.
- `raw_departures(ingested_at)` btree index applied + migration committed.
- `.gitignore` / repo hygiene (see §11 Repo hygiene).
- **`fct_passenger_journeys` converted to a VIEW** (`materialized='view'`, indexes removed). Confirmed committed (`git show HEAD`). The board reads it with a narrow one-O-D-plus-date query so the recomputed self-join stays tiny.
- **`fct_claimable_journeys` committed as a plain full-refresh TABLE** (`materialized='table'`, claimable-only, filter-before-join: the `arrivals` CTE applies `arrival_delay >= 1200 or canceled` *before* the join so the full fan-out never forms). Tracked, with a `journey_key` grain test in `_marts.yml`. Full-refresh build verified to produce **exactly** the same 1,188 claimable legs as the old `fct_passenger_journeys where is_claimable` (zero set difference both ways). Restructure is semantically equivalent, performance-only.

### PARKED — making `fct_claimable_journeys` incremental
The incremental version is **not** committed (current committed model is the full-refresh table above). It was debugged through two errors worth remembering:
- *"aggregate not allowed in WHERE"* — malformed nesting of the `max(ingested_at)` watermark subquery.
- *"column ingested_at does not exist"* — the watermark reads `max(ingested_at)` from `{{ this }}` (the target), but the model wasn't emitting `ingested_at`. Fix: carry `greatest(origin.ingested_at, dest.ingested_at) as ingested_at` in the final select.

Watermark concept (NOT abandoned): lookback measures from `max(ingested_at)` of the target's own rows (last successful run) minus a **6 h margin** = GTFS-RT settling tail (~2 h) + GH-Actions build gap (~4 h). It must measure on **ingestion time, not service date**, because a delay keeps getting revised for ~2 h *after* the train runs, and a late revision is exactly what flips a leg claimable.

**The parked decision — the retraction problem.** Claimable-only + delete+insert keyed on `journey_key` cannot retract: a leg that *stops* being claimable (delay revised back below 20 min) produces no row next run, so delete+insert never deletes the stale claimable row — it lingers wrongly. Three resolutions:
- **A.** `pre_hook` deletes the whole reprocessed trip-window before insert; insert claimable-only. Exactly correct every run, but adds a moving part and duplicates the window logic between hook and model.
- **B.** Plain claimable-only delete+insert (accept rare stale row) + a **scheduled full-refresh** to reconcile. Table is tiny (~1,188 rows, ~3 s rebuild; ~140 MB at 1000 stops), so full-refresh is nearly free. **Lean recorded: B** — retraction (e.g. a 21-min delay corrected to 18) is rare, the 6 h window absorbs most volatility before capture, and full-refresh is cheap at this size. Matches the anti-premature-complexity instinct (§5/§9).
- **C (surfaced this session).** Don't go claimable-only at all: keep emitting *all* legs incrementally with `is_claimable` as a column. Because every leg of a touched trip reappears each batch, a revised-down leg comes back as `is_claimable=false` and delete+insert *self-heals* — retraction is free. Cost: it's the full quadratic table again (the thing the refactor is trying to avoid at 1000 stops), and an orphaned-leg edge case if a stop vanishes entirely from the feed. So C trades the retraction problem for the scaling problem; it's the right shape only if the table stays a flagged-all-legs design rather than claimable-only.

Decision (A vs B vs C) **not yet made** — required before any incremental `fct_claimable_journeys` goes on the schedule. Not a blocker for anything already committed.

### OPEN TO-DOs (parked, none blocking)
1. Decide retraction handling (A/B/C above). Lean = B (keeps the small claimable table) unless we accept the full table (C).
2. **Departures board source.** Claimable-only can't feed the board (`onlyClaimable:false`) — board reads the `fct_passenger_journeys` VIEW narrowly; delay-alerts + claim filing read `fct_claimable_journeys`. Confirm `useJourneys` points each page at the right source.
3. **Curate any public wrapper over the claimable table** to EXCLUDE plumbing columns (`ingested_at`, `origin_sequence`, `destination_sequence`, …) per the existing curated-column convention.
4. **`fct_passenger_journeys` VIEW grain test.** Its `unique_combination_of_columns` test now re-runs the full self-join on every `dbt test` (costly at scale). Decide drop (source `fct_departures` grain is already tested, so the view can't violate a grain its source doesn't) vs keep. Lean = drop.
5. **`_marts.yml` deprecation.** The `fct_departures` test entry still uses top-level `combination_of_columns`; nest under `arguments:` (dbt 2.x). Trivial.
6. **null `arrival_delay` handling.** `coalesce(arrival_delay,0)` excludes unsettled delays — safe ONLY because the 6 h lookback re-pulls and re-evaluates. If lookback ever shrinks below the settling tail, this becomes permanent missed claims. Coupling to remember.
7. **`arrival_delay` is a misnomer** (confirmed via data this session): it's the signed deviation of THIS ROW's event, not specifically arrival — exactly `realtime - scheduled` per row, differing by event_type (arrival avg ~46 s, departure avg ~104 s). The self-joins are correct because they read the value off the arrival-side row (`dest`). Rename to `delay_seconds` / `event_delay_seconds` OR document in `_marts.yml`; isolated commit, check downstream refs first. Not urgent.
8. **DONE: raw 10-day prune is live** (`prune-raw-departures-10d`, daily `30 3 * * *`), implemented pre-Pro. Still TODO: **`fct_departures` ~70-day prune** as a pg_cron job (after Pro). Destructive DELETEs; show plan before applying. Note `--full-refresh` of `fct_departures` is now destructive past the 10-day raw horizon (§10).
9. **fct_departures column-width prune** (~31% of row width is denormalised text labels, re-derivable from dims by id). Secondary lever, for when the ingestion path is next touched.

### DROPPED FROM SCOPE (for now)
- v2 "could you have caught a better alternative" — dropped. (It was the only consumer of realtime *change history*; its removal is why a short raw buffer + final-state fct is sufficient.)
- 72-hour pre-announcement rule — dropped for now (still tracked as a correctness gap in §10 / roadmap §9 v1.5).

### Verification queries to re-run when resuming
- **Equivalence:** claimable count from `fct_claimable_journeys` should equal `count(*) filter (where is_claimable)` from the `fct_passenger_journeys` view, with zero set-difference both ways on `journey_key`.
- **Incremental idempotency** (once incremental lands): run incrementally twice over unchanged data; total count stable (no doubling ⇒ delete+insert is idempotent).
