# CLAUDE.md — Claim My Train

Standing project context. Read at the start of every session.

---

## 1. What this project is

A Supabase + dbt + React frontend (hosted by Lovable) that automates train delay compensation claims for Swedish public-transport commuters.

**Hosting (important):** production frontend is served by **Lovable** at `https://claim-my-train.lovable.app` (canonical entry: `/regions/skanetrafiken/delay-alerts`). Lovable deploys from a **separate companion GitHub repo** it owns — `Fakhravar1/claim-my-train-ab5b0f74` — NOT the working repo `Fakhravar1/claim-my-train`. The two repos are not linked by Git. Keeping them in sync is handled by the `mirror-to-lovable` GitHub Action in this repo, which force-pushes working `main` to the companion on every push (see §11 "Publishing frontend changes to production" for the procedure and the manual fallback). If the mirror Action ever stops firing or the companion drifts ahead (e.g. Lovable AI commits there), prod silently runs different code from working main — that's the new failure mode (§10). Code editing in Lovable's web UI is no longer used — the companion repo is host-only, not an editing surface. The two-repo split is deliberate: the working repo holds Supabase secrets and runs backend CI (dbt), and Lovable AI has no commit access to it.

**Scope (past MVP as of 2026-06-16):** the **full Skåne rail network** — all ~80 stations on the Dec-2024 Skånetrafiken line map are now polled and **claimable** (TV ingestion via `collect-train-announcements` v12; see §15). This supersedes the original single-corridor MVP (Malmö C ↔ Copenhagen H, single operator VR Sverige AB / Öresundståg). Still a flat **20-min delay threshold** and the regional regime (Lag 2015:953) for all of it, for now.

**Operator is a claim-time USER choice, not a data-derived fact.** The realtime feed can't cleanly tell us "which operator serves station X" — operators overlap on shared track and TV's labels are noisy (the `operator` field is the corporate *contractor* — ARRIVA runs both Öresundståg and Pågatåg, SNÄLL = Snälltåget, etc. — and `information_owner`/`train_owner` flip at contract seams). So we **don't** try to pin operator per station/journey in the data: the journey fact stays operator-agnostic (§5/§8 already mandate this — operator is descriptive context, never a rule key), and the **user attests which operator/ticket they travelled on when filing**. That attestation is what keys the compensation rule once rules actually diverge (§9 v3, `dim_compensation_rules`). We can still *default/hint* the operator from the observed `information_owner` on the journey, but the user can override.

**Guardrail shipped 2026-06-16.** `profiles.purchasing_operator` (CHECK: `skanetrafiken`/`sj`/`snalltaget`/`other`; migration `20260616130000`) is chosen on **Settings → Ticket** and added to `AuthContext.fetchProfile`'s column list (§3 footgun). Claim filing — **both** the delay-alerts confirm dialog (`SkanetrafikenDelayAlerts.tsx`) and the bulk review page (`SkanetrafikenClaimReview.tsx`) — is blocked (button disabled + explainer) unless it equals `skanetrafiken`. It's **required to save** the profile (any listed vendor is valid, routed to the Ticket tab on error), but only Skånetrafiken can **file**. Shared helpers `PURCHASING_OPERATORS` / `isSupportedPurchasingOperator` / `purchasingOperatorLabel` live in `src/lib/claimProfileValidation.ts`. This is the guardrail-only stage; the same column becomes the `dim_compensation_rules` key when operator #2's rules land (§9 v3).

**Still out of scope (deliberately deferred):** the **72-hour pre-announcement rule** (Lag 2015:953 — explicitly held off 2026-06-16; until modelled, claims for pre-announced timetable changes are false positives — keep the §10 caveat in the UI), EU 2021/782 jurisdiction flip (>150 km — now actually reachable since long routes like Malmö–Halmstad/Karlshamn are in), taxi/annan-transport path, multi-ticket-type valuation, per-operator rules (`dim_compensation_rules`), force-majeure detection, Resplus, analytics dashboards.

**Sequencing principle:** ship working slices first, then layer complexity. The corridor MVP shipped and is now generalized to the whole network; per-operator rule modelling and the 72-h rule are the next correctness layers — add them when they're actually needed, not speculatively.

**Frontend layout:** `/` is the marketing landing for signed-out visitors (`src/pages/Landing.tsx`); a `<ProtectedFromAuth>` wrapper redirects signed-in users to `/regions/skanetrafiken` (the departures cards page). The cards page itself is **public** — both `/regions/skanetrafiken` and `/regions/skanetrafiken/delay-alerts` are reachable without sign-in; claim filing still requires auth. There are no separate regional marketing pages anymore — `/regions/sl` and `/regions/vasttrafik` were dropped, and the OperatorPicker on the landing marks them inert "Coming soon" cards. The departures pages have their own design-system look (decorative Skåne weather band, cmt-* tokens) injected via `src/hooks/useAppShellStyles.ts` + `src/themes/regional-app-base.css`, scoped to the region routes so `/login` and `/settings` keep the shadcn theme. The landing keeps the older `src/hooks/useLandingStyles.ts` + `src/themes/landing-base.css` pair on the same scoping pattern. All routes that ship inline SVG payloads (landing, both region pages) are lazy-loaded.

**Frontend data path (since 2026-06-11):** `SkanetrafikenApp.tsx` (at `/regions/skanetrafiken`) and `SkanetrafikenDelayAlerts.tsx` (at `/regions/skanetrafiken/delay-alerts`) query **`public.v_journeys`** (wrapper over `dbt_dev.fct_journeys`, the **unified TV+REST journey fact** — see §15) via `src/hooks/useJourneys.ts`. Departures page passes `onlyClaimable: false`; delay-alerts passes `onlyClaimable: true`. Coverage is the **full Skåne rail network** (~80 Swedish stations via TV + the 6 Danish corridor stops via REST — past-MVP as of 2026-06-16; see §15); the unified contract uses mode-agnostic names (`service_number`, `line_name`, `transport_mode`, `origin_source`/`destination_source`). The old REST-only path (`fct_passenger_journeys` + `public.v_passenger_journeys`, and the unused `dim_line`) was **REMOVED 2026-06-11** — models deleted, views dropped (migration `20260611140000`); git history + `dbt build` is the rollback if ever needed. The route card on both pages has a Date field that **defaults to today** and drives `useJourneys` — we query a single day at a time, so the payload is small. Dropdowns on those pages plus Settings are driven by `src/hooks/useStations.ts` (`public.v_active_stations`, now derived from `fct_journeys` → exactly the network stations actually carrying journeys). The legacy live-departures plumbing (the `get-train-departures` edge function, the `claim-collection-15m` cron, and tables `departures` / `train_names` / `yellow_alert_history` / `claimable_corridor_windows` / `api_call_events` / `stations_master`) has been retired. The `SAMS_TO_GTFS` / `GTFS_TO_SAMS` maps in `shared/stops.ts` survive only for inbound URL-param normalization on legacy bookmarks (e.g. `?from=740000003` on the old `/delay-alerts` paths).

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
- **Auth:** Supabase Auth, user profiles in `public.profiles`. **Footgun:** `AuthContext.fetchProfile` (`src/contexts/AuthContext.tsx`) loads the profile with an **explicit column list**, not `select('*')` — so any **new `profiles` column must be added to that list** or `profile.<col>` is silently `undefined` everywhere in the frontend (this is exactly what hid `signature_path` and made the delay-alerts dialog treat a saved signature as missing). AuthContext fetches the profile **once** at load; after a Settings save call `refreshProfile()` (exposed from the context) so the change propagates without a full page reload.
- **Claim filing pipeline:** Python worker in `claim-worker/` (reportlab + pypdf + pillow) — polls `public.claims` for `status='pending'`, fills the Skånetrafiken reklamation PDF from the claim's journey snapshot + the user's `profiles` row, **stamps the user's signature PNG above the Underskrift line**, uploads it to the private `claims` Supabase Storage bucket, and flips the row to `generated` (or `error`). Runs on GitHub Actions (`.github/workflows/claim-pdf-worker.yml`, daily `0 6 * * *` + `workflow_dispatch`), using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` repo secrets (service-role key bypasses RLS — backend-only, never in the frontend). We chose GitHub Actions over Render here because **Render cron jobs are paid**, and Actions already hosts the dbt job. Generate-and-store only: no auto-submission to Skånetrafiken.
  - **Signature flow (added 2026-06-10).** The user draws a signature once on Settings (`src/components/SignaturePad.tsx`, a dependency-free pointer canvas); on save it's uploaded as a transparent PNG to the private `signatures` bucket at `{user_id}/signature.png`, and `profiles.signature_path` points at it. RLS on the bucket is own-folder only (`(storage.foldername(name))[1] = auth.uid()::text`). A signature is a **required** claim-profile field — both Settings save and the delay-alerts confirm dialog block without one. Consent is **per-filing, not per-draw**: confirming a claim re-uses the stored signature and records `claims.consented_at` + a snapshot of `claims.signature_path` (so the audit trail survives a later signature change). The worker prefers the per-claim `signature_path`, falls back to the profile's, and **fails the row loudly** rather than emit an unsigned form. `reportlab` needs `pillow` to decode the transparent PNG (`mask="auto"`). Migration: `supabase/migrations/20260610120000_add_signature_capture.sql`.

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
│   │   │   ├── stg_departures.sql           ← REST feed, cleaned
│   │   │   └── stg_train_announcements.sql  ← Trafikverket feed, conformed vocabulary (§15)
│   │   ├── intermediate/
│   │   │   ├── int_stop_events.sql          ← TV+REST disjoint union (INCREMENTAL TABLE, §15)
│   │   │   └── _intermediate.yml            ← grain tests
│   │   ├── dimensions/
│   │   │   ├── dim_stations.sql
│   │   │   └── dim_active_stations.sql      ← stations appearing in fct_journeys (the dropdowns)
│   │   └── marts/
│   │       ├── fct_claimable_journeys.sql   ← claimable legs only (table; the durable claim-retention layer). See §13
│   │       ├── fct_journeys.sql             ← THE journey fact (view over int_stop_events; frontend reads this)
│       ├── agg_corridor_delays_daily.sql ← scouting: daily delay aggregate at monitored hubs (§18)
│       ├── agg_corridor_delays.sql      ← scouting: corridor ranking view (§18)
│   │       ├── v_active_stations.sql        ← public wrapper view (dbt-managed, schema='public')
│   │       ├── v_journeys.sql               ← public wrapper view over fct_journeys
│   │       └── _marts.yml                   ← model tests & docs
│   ├── seeds/
│   │   ├── claim_authorities.csv           ← versioned eligibility rules per claim authority (seeds is_claimable in fct_journeys)
│   │   └── _seeds.yml                       ← seed description + not_null/unique tests
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
  - (`fct_departures` — **retired 2026-06-13**. Was the REST-only stop-event substrate; became consumer-less when the retention layer moved to `fct_journeys`, so dropped to reclaim 51 MB. Model file deleted, table dropped via migration `20260613120000`. Git history is the rollback.)
  - `int_stop_events`: one row per (service_number, station_id, event_type, service_date). Conformed stop-event grain across TV + REST (§15). Incremental table.
  - `fct_journeys`: one row per (service_number, origin_local_date, origin_stop_id, destination_stop_id). Journey-leg grain, VIEW over `int_stop_events` — the fact the frontend reads.
  - `agg_corridor_delays_daily`: one row per (hub_signature, direction, counterpart_signature, operator, service_date). Corridor-scouting daily delay aggregate at monitored hubs — NOT a claim model (§18). Incremental, accumulates past the raw prune.
  - `fct_claimable_journeys`: same journey_key grain as `fct_journeys`, **claimable journeys only**, captured incrementally and **kept 90 days** (pre_hook prune; max of the 60/90 d operator regimes — per-operator pruning waits for `dim_compensation_rules`) regardless of upstream pruning — the durable claim-retention layer. Served to the delay-alerts page via `public.v_claimable_journeys`. **NEVER `--full-refresh`** once it holds rows older than the raw horizon (collapses retention to ~10 d and silently breaks the claim-window guarantee).
  - (`fct_passenger_journeys` — removed 2026-06-11; superseded by `fct_journeys`.)
- **Surrogate keys:** every fact has one, generated from business keys via `dbt_utils.generate_surrogate_key([...])`. Never use ingestion artifacts (like raw row UUIDs) as the basis — must be deterministic from business keys.
- **Grain tests:** every fact has a `dbt_utils.unique_combination_of_columns` test on its natural grain. Grain violations = silent data corruption.
- **Degenerate dimensions:** business keys (trip_id, stop_id, etc.) live on the fact for traceability, alongside surrogate FKs to conformed dims.
- **Dedup at staging→fact boundary:** GTFS-RT publishes multiple updates per stop event; deduplicate with `row_number() over (partition by ... order by ingested_at desc) where rn = 1`. This is Kimball's late-arriving fact pattern (Toolkit Ch. 19).
- **No business-rule thresholds hardcoded in SQL when they're meant to be parameterized.** Current v1 hardcodes 20-min threshold; this gets refactored into `dim_compensation_rules` when we add operator #2 — not before.
- **No `CASE WHEN operator = '...'` branches in fact tables.** Operator-specific logic belongs in joined rule tables, not in fact SQL.
- **Rules attach to claim authority + route characteristics, NOT to operator.** Operator concessions change; rules don't. The "operator-agnostic fact" pattern means `fct_journeys` carries `operator` / `line_name` as descriptive context only — never as a rule key. Same applies to `transport_mode` (multi-modal by design, §15).
- **Materialization strategy:** staging and dimensions are views; facts with expensive logic (dedup, self-joins) are tables with indexes on dominant query patterns. Per-model `{{ config(materialized='table') }}` in each file. Diagnose with `explain (analyze, buffers)` before changing materialization; never materialize speculatively. **Updated by the storage refactor (§13):** `fct_departures` is the materialized substrate (incremental table, ~70 d retention target); `fct_passenger_journeys` is now a **view** (the full all-pairs fan-out never hits disk — the board reads it narrowly by one O-D + date); `fct_claimable_journeys` is the only journey-grain **table**, kept small because claimable is delay-bounded (~1.5% of legs), not stops-bounded. Rationale: the quadratic all-pairs fan-out is what doesn't scale to ~1000 stops, so we only persist the tiny claimable slice. The unified TV+REST chain (§15) follows the same pattern: `int_stop_events` is the incremental-table substrate (linear, indexed, analyze post_hook), `fct_journeys` is the lazily-read view on top.
- **Incremental facts:** `fct_departures` is `materialized='incremental'` (`delete+insert` on `departure_key`). A full rebuild scans all of `raw_departures` (EXPLAIN ANALYZE: ~79s, ~95% in the raw index scan, growing linearly with raw volume) — incremental cuts each run to the recently-active slice. **Incremental unit = the trip, not the row.** `stop_sequence` is a `row_number()` over `(trip__trip_id, trip__start_date)`, so it spans the whole trip; feeding it a partial trip silently misnumbers stops and corrupts the `fct_passenger_journeys` origin/destination pairing (verified: all 73k legs satisfy `origin_sequence < destination_sequence`, and `is_claimable` reads the delay off the sequence-selected destination row). The `is_incremental()` filter therefore selects whole trips touched since `max(ingested_at) - 1 hour`, never a flat row-level watermark. General rule: the incremental grain must be ≥ the coarsest key any window / aggregate / self-join spans.
- **Presentation-layer wrapper views** in `public` (`v_journeys`, `v_active_stations`, future additions) are dbt models with `schema='public'`. The custom `generate_schema_name` macro in `dbt/macros/` makes the `schema='public'` config land objects directly in `public` instead of the dbt-default `dbt_dev_public`. Wrappers are part of the dbt DAG (via `ref(...)`), so they rebuild automatically when underlying facts/dims change. No manual recreation needed after materialization changes.

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
dbt_dev.fct_claimable_journeys (incremental table — claimable journeys from fct_journeys, kept 90 d; the durable retention layer. NEVER --full-refresh)
       │
       │ public.v_claimable_journeys (column-compatible with v_journeys)
       ▼
Delay-alerts page (useJourneys onlyClaimable:true)
dbt_dev.dim_active_stations (table — derived from fct_journeys, §15)
       │
       │ public.v_active_stations
       ▼
Frontend dropdowns (useStations)

(fct_passenger_journeys / v_passenger_journeys / dim_line REMOVED 2026-06-11 — git history is the rollback)

SINCE 2026-06-11 the JOURNEY data path is the unified TV+REST chain (§15):
raw_train_announcements + raw_departures(Danish stops) + ref_stations
  → stg_train_announcements / stg_departures (views)
  → int_stop_events (INCREMENTAL TABLE — the materialized substrate, indexed)
  → fct_journeys (view — quadratic pairing recomputed lazily, read narrowly)
  → public.v_journeys → Frontend (useJourneys)
Freshness: gated on `dbt build` (GH Actions, 1–4 h jitter), same as the legacy
chain — int_stop_events was deliberately materialized for the ~1000-station
target (an earlier views-over-raw version was cron-fresh but recomputed the
dedup over all raw on every page load; that stopped scaling the moment the
station count grows).
```

**Critical fact about freshness:** dimension and staging models are views (always live), and `fct_passenger_journeys` is now a view too — but a view is only as fresh as the **table it reads**, and it reads `fct_departures`, which is a materialized incremental table (stale until the next `dbt build` runs). So freshness is still gated on `dbt build`: the frontend cannot show a journey until the scheduled Action has processed the new raw row into `fct_departures`. `fct_claimable_journeys` and `dim_active_stations` are likewise tables refreshed only by `dbt build`. Currently 1–4 hours of GH scheduling drift between ingest and visibility (the cause of the "no afternoon departures" symptom — last build sets the visible horizon).

**Working:**
- `raw_departures` ingestion from Trafiklab GTFS-RT via the `collect-raw-departures` edge function. Keep the deployed copy and `supabase/functions/collect-raw-departures/index.ts` in sync — drift between them is what masked the May 2026 Triangeln incident (§10). The table's unique constraint is `(trip__trip_id, trip__start_date, stop__id, scheduled, ingested_at, event_type)`. `event_type` MUST stay in both the constraint and the function's `onConflict` argument, otherwise arrival rows for intermediate stops collide with the same-trip departure row in the same upsert batch and get silently dropped by `ignoreDuplicates: true`.
- Scheduled `dbt build` via `.github/workflows/dbt-run.yml` keeps `fct_*` and `dim_active_stations` tables fresh. Triggers: `schedule: */15` + `workflow_dispatch` (for manual runs from the Actions tab). Logs visible per-run in the GitHub Actions UI.
- `stg_departures` cleaning layer.
- `int_stop_events` (§15) is the materialized substrate, indexed on `(event_type, station_id, service_date)` + `(service_number, event_type, scheduled)`. (`fct_departures` — the old REST-only substrate — was retired 2026-06-13; see §15.)
- **The date concept that is load-bearing: `origin_local_date`** = `(origin.scheduled at time zone 'Europe/Stockholm')::date` — the **calendar day the origin departure physically runs**. This is what users mean in the date picker, and what the frontend filters on. (History: filtering on the GTFS service date `trip__start_date` produced a "picked the 24th, top card says 25 May" bug — post-midnight trips belong to the previous service date. `fct_journeys` keys on `origin_local_date` natively.)
- `dim_stations` view (from REST stops; includes the Danish corridor stops — but NOT TV-only stations, since it derives from REST-polled boards).
- `dim_active_stations` table = every station appearing in `int_stop_events`, **names from the conformed layer itself** (each leg carries `station_name` from its own feed), coords left-joined from `dim_stations` (nullable for TV-only stations; no component reads them). Source for the frontend dropdowns. Lesson (2026-06-11, Lund): deriving names from `dim_stations` made TV-only stations vanish from dropdowns — Lund C was the first station never REST-polled. When adding stations via the TV `STATIONS` array, no dim work is needed; the chain picks them up on the next `dbt build`.
- v1 claim logic in `fct_journeys` — **seed-driven, not a literal** (since 2026-06-16):
  ```sql
  is_claimable = (coalesce(dest.delay_seconds, 0) >= auth.min_delay_seconds)
                 or (auth.includes_cancellations and coalesce(dest.canceled, false))
  ```
  `auth` is a single-row cross join from the **`claim_authorities` dbt seed** (`dbt/seeds/claim_authorities.csv`), filtered `where authority_key = 'skanetrafiken'`. For Skånetrafiken the row is `min_delay_seconds=1200`, `includes_cancellations=true`, so this reduces to **exactly** the old `delay >= 1200 OR canceled` (verified: 2453 = 2453 claimable, 0 mismatches). The threshold is now **versioned reference data** — adding a second claim authority is a new **row** (and turning `authority_key` from a constant filter into a real join key), not a code edit. The `OR canceled` branch stays load-bearing (exact-20-min + cancelled cases), now gated by `includes_cancellations`. **NEVER let the seed go empty** for the active authority — the cross join would drop every journey; the seed's `not_null`/`unique` tests guard this. This is the first step of §9 v3's `dim_compensation_rules`, kept deliberately thin: no route-distance / floor-amount / divisor valuation until operator #2 forces it. The full eligibility model (route < 150 km → lag 2015:953 50/75/100%; ≥ 150 km → EU 2021/782) lives in the seed's `notes`/`tier_model` as a label only.
- `public.v_journeys` and `public.v_active_stations` are dbt-managed views (`dbt/models/marts/v_*.sql`) materialized into the `public` schema via the `generate_schema_name` macro override. Each model declares a `post_hook` that grants `select` to `anon` and `authenticated`. Curated column lists exclude internal plumbing (`ingested_at` etc.).
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

**Frontend journey reads go through `public.v_journeys` (over `fct_journeys`), always narrow:**
```sql
select *
from v_journeys
where origin_stop_id = :origin
  and destination_stop_id = :dest
  and origin_local_date = :date
  -- and is_claimable = true   (delay-alerts page only)
```

Never put threshold logic (the "20 minutes" rule) in the frontend. The fact pre-computes `is_claimable`; the UI consumes it.

**Status (since 2026-06-11/12):** Both pages query via `src/hooks/useJourneys.ts`, but against **different sources**: the departures page (`onlyClaimable: false`) reads **`public.v_journeys`** (live unified fact, raw-horizon depth), while delay-alerts (`onlyClaimable: true`) reads **`public.v_claimable_journeys`** — the 90-day durable retention layer (§15), column-compatible with `v_journeys` — so claimables stay visible/filable for the whole claim window even after raw pruning. Its date picker reaches 90 days back. **O-D selections persist across the two views**: both pages sync `from`/`to` into the URL (replace, no history spam) and their cross-links carry the params; profile preferred-station defaults apply only when the URL had no route at mount. The O/D fields are **searchable comboboxes** (`src/components/region/StationCombobox.tsx`, Popover+Command/cmdk — type to filter) replacing the plain Selects. Journey lists sort **earliest-first** (ascending `origin_scheduled`, matching operators' own boards). Pages map `line_name ?? "Tåg {service_number}"` (TV legs have no line concept). `useStartClaim` fills `claims.trip_start_date` from `origin_local_date` (the claims app table keeps its column names). The legacy edge function + corridor-collector pipeline was decommissioned (migration `20260519120000_decommission_live_departures_pipeline.sql`). All three pages' dropdowns are powered by `useStations()`.

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
- Add a dbt `relationships` test linking `fct_journeys.origin_stop_id` and `destination_stop_id` → `dim_stations.stop__id`. Currently the FK relationship is convention-only; this test makes it auditable at `dbt test` time.
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
- **Lovable can silently stop deploying even when the mirror is green** (observed 2026-06-12: companion repo current, three push events, prod stuck on the previous day's bundle). Diagnosis: compare the served bundle hash (`curl -s https://claim-my-train.lovable.app/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'`) before/after a frontend push — unchanged hash = no rebuild. Remedies in order: (1) wait a few minutes; (2) re-fire the webhook with an empty commit (`git commit --allow-empty` + push); (3) if still stale, open the Lovable dashboard → project build/deploy history → manual Publish/redeploy, and check whether the GitHub connection needs reconnecting. Only the dashboard shows whether builds are failing vs not firing at all.
- The companion's own `dbt-run.yml` workflow has been disabled via `gh workflow disable` on top of the repo guard. If you ever need to re-enable backend CI on the companion (you shouldn't), both layers would need to be undone.
- Long-term alternatives if this stack becomes painful: (a) move hosting to Vercel/Netlify off the working repo and retire the companion; (b) keep the current setup. Re-pointing Lovable at the working repo isn't an option — Lovable's docs confirm reconnecting always creates a new repo, never links to an existing one.

### Debugging the scheduled dbt build

The workflow at `.github/workflows/dbt-run.yml` runs `dbt build` against the Supabase session pooler. If the frontend stops showing fresh journeys:

1. **Check recent Action runs** — GitHub repo → Actions → "dbt run". Failed runs show a red ✗; click in to see step output.
2. **Common failure modes:**
   - `Could not find a version that satisfies the requirement dbt-postgres==X.Y.Z` — pin in the workflow is wrong; check available versions on PyPI. The adapter version is **not** the same as dbt-core's version (see §3).
   - `connection refused` or `password authentication failed` — DB password rotated, or `SUPABASE_DB_*` secrets are stale. Get a fresh connection string from Supabase dashboard → Connect → Session pooler.
   - `prepared statement "X" already exists` — workflow is pointing at the **transaction pooler** (port 6543) instead of session pooler (5432). Fix the `SUPABASE_DB_HOST` / `SUPABASE_DB_PORT` secrets.
   - `relation "public.v_journeys" does not exist` after a `dbt run --full-refresh` — the dbt DAG should rebuild the wrappers automatically (they're dbt models); check `dbt build` step output for the wrapper models.
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
2. ~~**Departures board source.**~~ RESOLVED differently (2026-06-11): both pages read `v_journeys` (over `fct_journeys`); `fct_claimable_journeys` remains the durable retention layer, not yet wired to the frontend.
3. **Curate any public wrapper over the claimable table** to EXCLUDE plumbing columns (`ingested_at`, `origin_sequence`, `destination_sequence`, …) per the existing curated-column convention.
4. ~~**`fct_passenger_journeys` VIEW grain test.**~~ MOOT (2026-06-11): model removed.
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

---

## 14. Realtime data source cheatsheet (region × mode) — folded in from the 2026-06 source investigation

Think in terms of **"I want to add <mode> in <city> — is it possible, and which API?"** — not operators. "Possible" here means the data both **shows up AND reports genuine delays** (not hollow). Empirically verified June 2026 with live API tests.

### The only 3 APIs worth using
- **REST** — Trafiklab Realtime APIs (`realtime-api.trafiklab.se`), the current ingestion source (stop-board, all modes). Key (used in tests): the `Trafiklab Realtime APIs` Bronze key.
- **Trafikverket** — Trafikverket Öppet API (`api.trafikinfo.trafikverket.se/v2/data.json`), all Swedish **rail**, every operator, operator-independent (measured at track). POST XML query, `TrainAnnouncement` objecttype.
- **Västtrafik** — Västtrafik's own portal (`developer.vasttrafik.se`), separate signup/OAuth2. Only door to Göteborg city transit.

(Also explored but **not** recommended as primary: GTFS Sweden 3 RT / GTFS Regional RT — Swedish-only, border-clipped, piecemeal operator onboarding; **KoDa** — historical archive back to 2020, great for Skåne-internal backfill + the 72-h rule, but no Denmark / no SJ realtime / no Västtrafik; **ResRobot** — realtime is dead/unreliable, good only for stop lookup + journey planning; **SIRI** — derived from GTFS Sweden 3, same gaps.)

### Cheatsheet (✅ = verified genuine delays)

| Want to add… | Possible? | Use | Tested |
|---|---|---|---|
| Stockholm — metro | ✅ | **REST** | ✅ Slussen 26/79, T-Centralen 26/100 delayed |
| Stockholm — bus | ✅ | **REST** | ✅ Slussen 16/52 |
| Stockholm — tram | ✅ | **REST** | ✅ Alvik 4/33, Sundbyberg 7/18 |
| Stockholm — train (pendeltåg, SJ, …) | ✅ | **Trafikverket** | ✅ (REST is **hollow** for all Stockholm trains: Flemingsberg/Sundbyberg 0 nonzero) |
| Malmö — bus | ✅ | **REST** | ✅ 16/103 |
| Malmö — train | ✅ | **REST** (Öresundståg) / **Trafikverket** (all incl. Pågatåg) | ✅ |
| Malmö → Copenhagen — train (Danish stops) | ✅ | **REST** (only cross-border source) | ✅ København arr +1328 s |
| Göteborg — train | ✅ | **Trafikverket** | ✅ (REST genuine only for Öresundståg there) |
| Göteborg — tram | ❌ in Trafiklab → only via **Västtrafik** | **Västtrafik** own API | ✅ REST hollow 0/122 |
| Göteborg — bus | ❌ in Trafiklab → only via **Västtrafik** | **Västtrafik** own API | ✅ REST hollow 0/49 |
| Other Swedish city — any **train** | ✅ | **Trafikverket** (universal rail) | — |

### The rules behind it
1. **City transit (metro/tram/bus) in Stockholm or Malmö → REST.** Genuine.
2. **City transit in Göteborg → Västtrafik's own API.** Nothing in Trafiklab has it (incl. the all-vehicles GPS map) — Västtrafik doesn't publish realtime to Samtrafiken/Trafiklab.
3. **Any Swedish train → Trafikverket** is the safe universal choice (every operator, every region, genuine + real cancellations). Use **REST instead only for the Danish side** of the Öresund corridor — Trafikverket stops at the national border (København is Banedanmark).

### Why coverage is supplier-dependent (the non-obvious bit)
A station board in these APIs is **not measured at the station** — it's *assembled* per-train from whatever realtime feed covers that train. If the operator-mode hasn't been onboarded to the feed the API is built on, that row falls back to the scheduled time **but still sets `is_realtime=true`** → a "hollow" row (delay always 0). REST is built on GTFS Sweden 3, whose realtime onboarding is **piecemeal**: genuine for SL metro/bus/tram, Skånetrafiken buses, and Öresundståg; **hollow** for SJ/Mälartåg/Arlanda/Snälltåget/Vy/Pågatåg trains and **all** Västtrafik. Trafikverket is the exception that behaves like you'd expect a station board to — because it measures the **infrastructure** (track circuits), independent of operator.

### MANDATORY check before trusting any new city/mode
`is_realtime=true` is **not** a guarantee of real data. Before wiring up a new region/mode, pull that stop+mode and confirm **`realtime <> scheduled` (nonzero `delay`) on a meaningful share of rows**. All-exactly-zero across many rows = hollow → switch APIs. Historical proof of the trap: `fct_departures` held **57,554 Pågatåg rows and 1,822 SJ rows, 0.0% with any nonzero delay**, all `is_realtime=true` — while VR/Öresundståg was 91.2% nonzero.

### Per-API catches
- **REST:** genuine only where onboarded (above); retention ~18–24 h backward (rolling, not multi-day) — capture live, can re-query within ~a day, **cannot** backfill older. `canceled` flag is unreliable (real cancellations arrive as `alerts` text).
- **Trafikverket:** rail only (no metro/tram/bus); genuine for all rail incl. real cancellations (`Canceled=True`); live retention ~2 days → **Lastkajen** for older history; own query language + `LocationSignature`/`AdvertisedTrainIdent` IDs (no GTFS `stop_id`/`trip_id` — needs a crosswalk to stitch a Swedish Trafikverket leg onto a Danish REST leg by train number + time).
- **Västtrafik:** separate OAuth2 registration; the only source for Göteborg trams/buses (Planera Resa v4 for realtime departures, an unpublished `/fpos/v1/positions` for GPS).

---

## 15. Trafikverket integration + station crosswalk (built 2026-06)

Follow-on from §14: SJ (and all Swedish rail) realtime lives in **Trafikverket Öppet API**, which uses its own IDs, so we built a bridge to the REST/national `740…` IDs.

### `public.ref_stations` — the Trafikverket ↔ REST station crosswalk
One row per Trafikverket station; lets you search by name and get both ID systems (`select … where station_name ilike '%kalmar%'`).
- **Columns:** `tv_signature` (PK, Trafikverket `LocationSignature`, e.g. `Mc`, `Kac`), `station_name` (Trafikverket `AdvertisedLocationName`), `rest_area_id` (REST/ResRobot `extId`, the `740…` id REST queries take), `rest_name` (the REST stop's name, for human confirmation), `lat`/`lon`, `match_distance_m`, `advertised`, `resolved`, and **`name_match`** (generated: true when `station_name`'s first token appears in `rest_name`).
- **How it's built:** load all ~1,745 Trafikverket `TrainStation`s (signature + name + WGS84 coords), then for each find the **nearest ResRobot stop** (`location.nearbystops`) → that gives the REST `extId` + name + distance. There is **no shared station ID** between Trafikverket and REST — coordinate proximity is the bridge.
- **Trust gates:** `match_distance_m` (small = same place; >200 m = the nearest REST stop is a bus/tram/street stop, not the rail station) and `name_match` (false = names disagree). Corridor stations are all tiny-distance + `name_match=true`. Current coverage: **652/717 advertised resolved**, 627 `name_match=true`, 25 to eyeball, ~65 unmatched (minor/freight/foreign).
- **`build-ref-stations` edge function** (deployed, `verify_jwt=true`) is the documented refresh runner: first invoke loads stations; each subsequent invoke resolves 100 (id+name+dist), **paced 1/s**, via `update` not `upsert`. Repeat until `remaining:0`. Needs `RESROBOT_API_KEY` secret.
- **HARD LESSON — ResRobot rate-limits bulk coordinate lookups.** It allows a burst (~150–250) then throttles to hollow/empty. Any per-station resolution **must pace ~1/s** (concurrency 1 + delay); a 15-way `Promise.all` or no-delay loop silently caps at ~250 and the rest come back null. Also: a partial `upsert` (omitting `station_name`) fails the implicit INSERT on the NOT-NULL column — use `update`.

### Trafikverket realtime ingestion (live as of 2026-06-10)
`collect-train-announcements` edge function (deployed) polls Trafikverket `TrainAnnouncement` (station-event grain — one row per train × station × `ActivityType` arrival/departure) into the `public.raw_train_announcements` table, storing the full object in a `raw` jsonb plus typed columns (`scheduled_time`/`estimated_time`/`actual_time`, `canceled`, `advertised_train_ident`). Upserts on `activity_id` (no `ignoreDuplicates` — re-pulled rows UPDATE so settled actual times win). Pulls `STATIONS = ['Mc', 'Tri', 'Hie']` (Malmö C, Triangeln, Hyllie) on a 2 h lookback; add more `LocationSignature` codes to the in-function `STATIONS` array to widen coverage. **No repo copy of this function exists** — it's deploy-only (unlike `collect-raw-departures`), so the deployed source is the only source of truth; edit via redeploy. Driven by pg_cron `collect-train-announcements-1h` (hourly `0 * * * *`), which POSTs to the function.

**Status: live and verified** (2026-06-10). The earlier 500 was a version-1 code bug, since fixed. The real blocker was an **auth-gate mismatch**: the function had been deployed with `verify_jwt=true`, but the cron POSTs headerless (no `Authorization`), so every hourly call was bounced at the gateway with **401** and the handler never ran — `pg_net`'s cron status still read "succeeded" because it only confirms the request was *dispatched*, not the function's response. The 133 early rows were a single manual invoke (which carried a token). **Fix: redeployed with `verify_jwt=false`** (matching `collect-raw-departures`, which is public the same way) — version 4, verified with a headerless POST returning `200 / rows:110`, and the hourly cron now ingests. **DO NOT re-enable `verify_jwt` on a future redeploy** unless you also add a bearer token to the cron command, or ingestion silently dies again (cron will still show green). Same trap applies to any cron-driven collector.

To stitch a Swedish Trafikverket leg onto a Danish REST leg, join on **train number** (`AdvertisedTrainIdent` ↔ REST `technical_number`/`designation`) + date; for stations use `ref_stations`.

### REST + Trafikverket train stitch (built 2026-06-10, branch `feat/stg-train-announcements`)

The train product stitches two feeds that cover **separate territory**, so it's a plain **disjoint union — no precedence/overlap logic**:
- **TV** (`stg_train_announcements`) — **Swedish** train stops, genuine track-measured delay.
- **REST** (`stg_departures`) — the **Danish** leg only (København H, etc.). REST's long-term train role is Denmark + (future) non-train modes; it does **not** supply Swedish train delays (it's hollow for most Swedish operators, §14). The existing Öresundståg-via-REST product is a separate, untouched path.

Models (both views, pushed, **NOT on `main`** so the mirror hasn't shipped them):
- `models/staging/stg_train_announcements.sql` — normalise `raw_train_announcements` to the conformed stop-event vocab (`event_type` arrival/departure, `realtime = coalesce(actual, estimated)`, `delay_seconds` signed / NULL not 0, `is_realized`). **No joins**. Fixes the §13 #7 `arrival_delay` misnomer at birth.
- `models/intermediate/int_stop_events.sql` — **disjoint union**: TV Swedish stops `union all` REST **Danish-only** stops, grain `(train_number, station_id, event_type, service_date)`, intra-source latest-poll dedup only (no cross-source precedence — territories don't overlap; verified **0 stations served by both**, 0 grain violations). `ref_stations` registered as a `reference` source (edge-built, not dbt-managed → `source()` not `ref()`).

**Crosswalk fact (verified).** REST `stop__id` is the **SHORT** id (`3`, `1586`, `1587` / DK `25315`), NOT the `740…` form — REST strips the prefix. Conform on the short id; TV maps in via `right(ref_stations.rest_area_id, 6)::int = stop__id`, gated to `^740[0-9]{6}$` (Swedish ids only). Train number: REST `trip__technical_number` (integer) ↔ TV `advertised_train_ident` (text) → conform to text.

**Stitch key = `(train_number, service_date)`, verified.** A train keeps the same number across the border — **97.9%** of København H arrivals (REST) match a Malmö C departure (REST) under the same number+date, and TV uses that same number on the Swedish side. Example: train 1061 (2026-06-10) = Malmö C dep 11:35 (TV) → København H arr 12:13 **+238 s** (REST).

**`fct_departures` is NOT touched** — it remains the substrate for `fct_claimable_journeys` (the durable claim-retention layer; both deliberately kept). The deprecated REST-only journey path (`fct_passenger_journeys`, `v_passenger_journeys`) and the unused `dim_line` were **REMOVED 2026-06-11** (models deleted, views dropped via migration `20260611140000`; recreatable from git). The earlier precedence-window + fct delay-overlay design was **dropped as overkill** — it solved feed *overlap* that doesn't exist once REST is scoped to Denmark. Don't reintroduce it.

**`int_stop_events` is an INCREMENTAL TABLE (since 2026-06-11, for the ~1000-station target).** This is the §13 pattern applied to the new chain: persist the **linear** stop-event grain, keep the **quadratic** journey fan-out (`fct_journeys`) a view read narrowly (one O-D + date). Design facts that matter:
- **Incremental unit = the stop-event key** (`delete+insert` on `stop_event_key`, 6 h `ingested_at` lookback). A row-level watermark is **safe here, unlike `fct_departures`**, because the only window function is the dedup whose partition IS the unique key — nothing spans beyond one key (§13 rule: incremental grain ≥ coarsest key any window spans). TV raw upserts in place (re-pulls refresh `ingested_at`), so revised events re-enter the batch; verified idempotent (second run reprocesses only the window, count stable).
- **Indexes** (dbt-managed): `(event_type, station_id, service_date)` for the board's narrow read, `(service_number, event_type, scheduled)` for the pairing join. `station_id` is **text natively** in the table — TV maps in via `right(rest_area_id,6)::int::text` — because a `station_id::text` cast in the view made the station predicate non-sargable (planner filtered instead of index-matched; harmless at 7 stations, lethal at 1000). Verified plan: both indexes index-cond on all columns, ~43 ms cold for one O-D+date.
- **`post_hook="analyze {{ this }}"`** — dbt does NOT analyze after build, and a freshly full-refreshed table with stale stats made the planner pick a 260 ms join-filter plan (rows=1 estimates). The hook removes that footgun.
- **Freshness consequence:** journey visibility is gated on `dbt build` again (deliberate trade). `raw_train_announcements(ingested_at)` btree added for the lookback filter (migration `20260611130000`, applied via MCP).
- **`--full-refresh` of `int_stop_events` is bounded by raw retention** (TV raw pruned at 5 days since 2026-06-16; REST raw 10 days) — same §10 hazard class: a full-refresh rebuilds from ≤5 days of TV raw and permanently drops older `int_stop_events` rows. The claimable table is captured independently, so claim filing survives, but the departures board's history collapses to ≤5 days. In normal operation the board holds 7 days (the `prune-int-stop-events-7d` window); don't `--full-refresh` expecting even that back.

**Pruning (live; retention re-tuned 2026-06-16 to fit the full ~80-station Skåne network on free-tier).** Three pg_cron jobs bound the growers: `prune-raw-departures-10d` (jobid 5, REST raw), `prune-raw-train-announcements-5d` (jobid 12, TV raw — was 14 d; the conformed history lives in `int_stop_events`, so the raw buffer only needs to exceed the int 6 h incremental lookback + dbt-build stalls — 5 d is generous), `prune-int-stop-events-7d` (jobid 13, **was 90 d**; shortened because the durable claim set lives in `fct_claimable_journeys`, not here). Consequence of the 7-day int window: the **departures board** now shows only 7 days of history, while **claim filing reads `v_claimable_journeys` and keeps the full 90 days**. `fct_claimable_journeys` self-prunes at 90 d via its pre_hook (the durable layer — untouched by the re-tune; 0 claims lost, verified). Also 2026-06-16: the TV **`raw` jsonb is no longer stored** (collector v11) — it was ~1.4 kB of the ~1.65 kB/row and nothing reads it (stg uses only typed columns). With these three levers the network projects to ~270 MB / 500 MB. (DB was ~160 MB at 8 stations before the re-tune.)

**Multi-modal by design (trains-only today).** The whole chain is deliberately built for ALL means of transport even though only trains flow now: mode-agnostic vocabulary (`service_number` not train_number, `transport_mode` column, `line_name` not route__name), and future trams/boats/buses enter by extending `int_stop_events`' REST CTE filter (`route__transport_mode = 'TRAIN'` today) — no downstream rename needed. Don't add mode-specific columns or `CASE WHEN transport_mode` logic to the fact (§8 applies to modes as much as operators).

**Journey fact (LIVE, powers the frontend): `models/marts/fct_journeys.sql`** (view; renamed from `fct_stitched_journeys` 2026-06-11) + public wrapper **`models/marts/v_journeys.sql`**. Pairs `int_stop_events` — an origin DEPARTURE to a later ARRIVAL of the **same service_number within a 12 h window** (NOT date equality: a window handles §6 cross-midnight and the < 24 h recurrence keeps each physical run separate). Ordered by **scheduled time**, not `stop_sequence` (TV has none). Excludes same-station self-loops. Grain `(service_number, origin_local_date, origin_stop_id, destination_stop_id)`, tested. **Unified mode-agnostic contract**: `service_number` (not train_number), `transport_mode` ('train' for now), `line_name`/`line_terminus`/`operator` (nullable, descriptive-only), `origin_source`/`destination_source` ('tv'/'rest'), stop ids as **text** (match `v_active_stations.stop__id`), `origin_local_date` (frontend date filter). **Line/operator are coalesced across BOTH legs** (a TV leg has no line concept, so a tv→rest journey inherits the REST leg's line name, e.g. "Ö Karlskrona - … - København"; operator prefers the REST label — "VR Sverige AB"/"Pågatåg"/"SJ AB" — over TV's terse codes; tv→tv journeys fall back to the TV code, and pure-TV journeys with no line render as "Tåg {service_number}" in the UI). The card shows the operator in the meta band (`RegionDeparture.operator`). `dim_active_stations` derives from `fct_journeys` → dropdown = exactly the corridor stations. Destination delay → `is_claimable` (v1 rule: ≥20 min or cancelled). Verified: train 1053 (2026-06-10) Malmö C→København H +20.7 min flags claimable, origin leg TV / destination REST.

**Current coverage (FULL SKÅNE NETWORK since 2026-06-16, collector v12).** `STATIONS` in `collect-train-announcements` now lists **all ~80 stations on the Dec-2024 Skåne rail map** (every signature crosswalked in `ref_stations`, verified 2026-06-16) plus `Cst` (Stockholm C, monitoring-only). All Skåne stations are **claimable** (none in the §18 exclusion list). The pull `limit` was raised 5000→20000 to hold network-wide 2 h volume without truncation (a full pull is ~2.3k events; §15 gap #2's true pagination still only matters at the ~1000-station target). **Önnestad (`Önd`) is the one polled-but-invisible station:** its `ref_stations.rest_area_id` is null, so the `int_stop_events` 740-regex join drops it — it won't surface as a journey until its crosswalk is resolved (ResRobot `location.name` lookup, the `tmp-stop-lookup` pattern below). To add a new station: look up its `tv_signature` in `ref_stations`, append to `STATIONS`, redeploy (keep `verify_jwt=false`); add to the `int_stop_events` TV-exclusion list only if it should be monitoring-only.

**Ramlösa gotcha (2026-06-11), generalizable:** Trafikverket has TWO signatures named "Ramlösa" — `Ram` (the physical passenger station, but `advertised=false`, emits NO announcements) and `Hbgb` (historically Helsingborg godsbangård, `advertised=true` — announcements ride on THIS one). Both crosswalk rows were manually pointed at REST `740001270` ("Ramlösa station"); the auto-resolver had matched `Hbgb` to a bus stop (nearest-coord miss) and skipped `Ram` (it only resolves advertised stations). Lessons: (a) when a station won't resolve or yields no announcements, check for a sibling signature with `advertised=true`; (b) the build-ref-stations resolver can leave wrong nearest-stop matches — fix manually via a ResRobot `location.name` search (one-off: deploy a temp edge function using the `RESROBOT_API_KEY` secret; the `tmp-stop-lookup` pattern, delete after use).

**Storage per traffic added.** Pre-slim (measured 2026-06-11) TV raw was ≈ **1.9 kB/event** (the `raw` jsonb dominated). Since the jsonb was dropped (collector v11, 2026-06-16) TV raw ≈ **~0.3 kB/event** (typed columns only); `int_stop_events` ≈ 330 B/event. Measured 2026-06-16: the 8 hubs ingest ≈ 4.7k events/day. The full ~80-station Skåne network is order ~50k events/day; under the 5 d TV-raw / 7 d int retention that projects to ~75 MB raw + ~98 MB int (+ REST raw ~73 MB + the small claimable layer) ≈ ~270 MB — fits free-tier. At the ~1000-station target, revisit the retention windows again (and consider slimming `int_stop_events` columns next). REST Danish whitelist (`int_stop_events` `rest` CTE): `25314` CPH Airport (Kastrup), `23657` Tårnby, `25313` Ørestad, `25315` København H, `25318` Nørreport, `25317` Østerport (corridor terminus — added 2026-06-12 with their `860…` extIds `860000646`/`860000650` in `collect-raw-departures` v17; both repo + deployed copies updated). Widen TV by adding LocationSignature codes (look up in `ref_stations.tv_signature`) and redeploying; widen Danish in TWO places — the collector's `CORRIDOR_STOPS` (`860…` extId) AND this whitelist (the short `stop__id`, read from `raw_departures` after the first poll).

**Known scaling gaps before the ~1000-station expansion** (ingestion side — the dbt chain is ready):
1. **RESOLVED (2026-06-16)** — ~~`raw_train_announcements` has NO prune job~~. `prune-raw-train-announcements-5d` (jobid 12) now bounds TV raw, and the `raw` jsonb is no longer stored (collector v11), so the full Skåne network fits free-tier. Retention stays ≥ the int incremental lookback (6 h) with wide margin (5 d). At the ~1000-station target, re-evaluate the 5 d window and consider further column slimming.
2. **`collect-train-announcements` query shape breaks at scale** — `limit="5000"` per pull overflows well before 1000 stations × 2 h of events, and a 1000-element `<EQ>` OR-list is untested. Needs batching/pagination (e.g. chunk the station list across multiple POSTs, or drop the station filter entirely and pull the national feed once the whitelist is most of the network).

**Scope note:** with all four Danish stops in, the mart now also emits **Danish-internal journeys** (e.g. CPH Airport→København H) — structurally valid O-D legs but **out of scope for a Skånetrafiken claim** (those are Danish-domestic, not cross-border or Sweden-touching). Not filtered yet; a "journey must touch Sweden / be cross-border" product rule is the place to cut them when claim discovery reads this mart.

**journey_key discontinuity (accepted 2026-06-11):** `fct_journeys.journey_key` hashes different business keys than the old `fct_passenger_journeys.journey_key`, so claims filed before the switch won't match new keys — the "✓ Claim filed" badge won't show for them and a double-file is theoretically possible for those rows. Accepted because pre-switch claims are test data.

**Operator label = TV's `information_owner` (2026-06-11).** TV carries three operator-ish fields; only one is the brand users recognize: `information_owner` ("Öresundståg", "Skånetrafiken", "SJ", "Snälltåget"). `operator` is the corporate contractor (ARRIVA, SNÄLL) and `train_owner` is a terse code that flips at contract seams (Ö-TÅG/SKANE) — neither is shown. `int_stop_events` maps `information_owner` → the conformed `operator` column on the TV side; `fct_journeys` prefers the TV leg's label over REST's corporate `agency__operator` ("VR Sverige AB"), so only Danish-internal (rest→rest) journeys show the REST label. Caveat: TV stamps most corridor departures at Malmö C as "Skånetrafiken" (1,854 rows) vs "Öresundståg" (206), so cross-border cards often read "Skånetrafiken" — that's the feed's labeling, not a bug.

**`fct_claimable_journeys` rebuilt on the unified chain (2026-06-11).** Now reads `fct_journeys` (journey_key grain, was fct_departures/trip-keyed), captures `is_claimable` rows incrementally (delete+insert on journey_key, 6 h lookback on the `ingested_at` that `fct_journeys` carries for exactly this), and **retains 90 days** via a pre_hook prune (max of the 60/90 operator regimes) — self-maintaining, no pg_cron. Retraction = §13 plan B (rare stale row accepted; the scheduled-full-refresh reconcile is NOT available because **`--full-refresh` is forbidden** once rows outlive the raw horizon — it would collapse retention to ~10 d). Side effect: `fct_departures` lost its last consumer; kept as the long REST archive pending a deliberate retire decision.

---

## 16. Claim digest emails (built 2026-06-12; multi-route + tracking 2026-06-15)

Opt-in email listing late departures on the user's monitored commute routes, with one-click bulk filing.

**Multi-route model (since 2026-06-15).** A user has N monitored commutes in **`public.commute_routes`** (one row per route: `from_stop_id`/`to_stop_id`, four time windows, and `monitored_days smallint[]` = ISO weekday **1=Mon … 7=Sun**, empty = route paused). RLS is own-rows full CRUD. This **replaces** the old single flat `profiles.commuter_*` commute for digest selection — those columns are left in the DB (not dropped) but are **unused**; do not read them. Migration `20260615120000_add_commute_routes.sql` created the table and backfilled the one existing commute. The frontend reads via `src/hooks/useCommuteRoutes.ts` (`useCommuteRoutes` hook + `saveRoutes(userId, routes)` **replace-all** helper: delete the user's rows, insert the current list). `profiles.preferred_from/to_stop_id` (the board-defaulting "Usual travel route") and `profiles.digest_frequency` are unchanged and still on `profiles`.

**Pipeline:** pg_cron (`send-claim-digest-daily` `0 18 * * *` UTC ≈ 20:00 Stockholm; `send-claim-digest-weekly` `0 18 * * 0`) → `send-claim-digest` edge function (**deploy-only, no repo copy; `verify_jwt=false`** — the §15 cron trap) → Resend API (`RESEND_API_KEY` secret). Selection per user, **per route**: `public.v_claimable_journeys` rows matching `(from→to)` within the outbound window ∪ reverse within the return window (Stockholm local time of `origin_scheduled`; **an unset window = that direction matches all day**), **restricted to the route's `monitored_days`** (ISO weekday of `origin_local_date`), then **unioned and deduped by `journey_key` across all the user's routes**, minus already-claimed (`claims` by journey_key), minus already-digested (`digest_log`). **No new journeys → no email.** The email groups journeys by Stockholm travel day, lists the new ones + a standing-count line, and links to the review page with ALL unclaimed keys. Each Resend send carries `tags: [{user_id},{frequency}]` for tracking attribution (below). After a successful send, journeys are logged to `public.digest_log` (unique `(user_id, journey_key)` — a journey is digested once per user, ever). Test with body `{"frequency":"daily","dryRun":true}` (returns would-send per user, sends/logs nothing). Verified 2026-06-15: dryRun runs the multi-route path; idempotent (re-run sends 0).

**Settings:** `profiles.digest_frequency` (`off`(default)/`daily`/`weekly`, CHECK-constrained; migration `20260612120000`) plus the route cards both live under Settings → Commuter habits (`src/pages/Settings.tsx`). Route cards use `StationCombobox` for O-D, four `type="time"` inputs, and a Mon-first 7-chip weekday toggle; "Add route"/"Remove" manage the list; `handleSubmit` upserts the profile then calls `saveRoutes`. **§3 AuthContext footgun:** `digest_frequency` is in the `fetchProfile` column list; the six `commuter_*` fields were **removed** from `fetchProfile`/the `Profile` interface (routes no longer ride on the profile).

**Email open/click tracking (since 2026-06-15).** Resend → `resend-webhook` edge function (**deploy-only, `verify_jwt=false`**; verifies the Svix signature with the `RESEND_WEBHOOK_SECRET` secret — if that secret is unset it processes unverified as a bootstrap, so **set it in production**) → inserts to **`public.digest_events`** (`event_type`, `resend_email_id`, `user_id`/`frequency` resolved from the send tags, `link_url`, `raw` jsonb; service-role write, no public read; migration `20260615121000_add_digest_events.sql`). Click-rate = `count(distinct resend_email_id) filter (clicked) / … filter (delivered)`. **Manual setup still required by the user:** in the Resend dashboard, enable Open & Click tracking and add a webhook to the deployed `resend-webhook` URL (events `email.opened`/`email.clicked`/`delivered`/`bounced`), then copy its signing secret into `RESEND_WEBHOOK_SECRET`. Most reliable on a **verified domain** (see caveat a) — build/test against the owner address now, trust real-user numbers after the domain swap.

**Bulk review page:** `/regions/skanetrafiken/claim-review?journeys=k1,k2,…` (`src/pages/regions/SkanetrafikenClaimReview.tsx`, lazy route). Auth-gated (links to `/login?next=…` which round-trips). Journeys are **grouped by Stockholm travel day** under day headers; all pre-checked + select-all; same profile-completeness gate as the single-claim dialog (incl. signature); one confirm = one consent event → bulk `upsert` into `claims` with `ignoreDuplicates` on the `(user_id, journey_key, trip_start_date)` constraint, so a stale email can never double-file. Claim rows are built by `buildClaimPayload` (exported from `src/hooks/useStartClaim.ts`), shared with the single-claim dialog so the snapshot shape can't drift.

**Production caveats:** (a) Resend is on the **sandbox sender** (`onboarding@resend.dev`) — it only delivers to the Resend account owner's address; verify a sending domain and change `FROM` in the function before real users. (b) The digest reads the retention layer, so it can surface journeys up to 90 days old on first opt-in — by design (still filable). (c) `digest_log` is service-role-written only; users have read-own RLS.

---

## 17. Product backlog (TODO, unsequenced)

Standing product intentions, not yet scheduled. Unlike §9 (the data-model sequence), these are cross-cutting and can be picked up independently.

- **SEO.** Landing + region pages are an SPA with minimal crawlable content. Need per-route meta/title tags, OpenGraph/Twitter cards, a sitemap, and semantic headings. Consider SSR/prerender for the marketing landing (`src/pages/Landing.tsx`) since it's the acquisition surface.
- **Add Västtrafik (Göteborg).** Requires Västtrafik's **own** OAuth2 API — Göteborg tram/bus is NOT in Trafiklab (§14). Follow the §7 "adding a new operator" pattern (new theme, band, region routes); currently an inert "Coming soon" card on the landing OperatorPicker.
- **Add SL (Stockholm).** Trains via **Trafikverket**, metro/bus/tram via **REST** (§14). Same §7 operator pattern; also currently a "Coming soon" card. (Note: the corridor monitor in §18 already polls Stockholm C for delay scouting — independent of launching SL as a claimable region.)
- **Stripe payments.** Monetisation (success-fee or subscription). Needs Stripe Checkout + a webhook edge function + a `payments`/`subscriptions` table; gate claim filing and/or digest emails behind entitlement. Service-role webhook only; never the secret key in the frontend.
- **Signup phone/email verification.** Supabase Auth email confirmation + phone OTP at signup, required before a claim profile can be completed (claims carry personnummer + payout — identity assurance matters before filing).
- **Verify a Resend sending domain (unblocks real email + open/click tracking).** The digest still sends from the Resend sandbox sender (`onboarding@resend.dev`), which only delivers to the Resend account owner and exposes **no open/click tracking** (it's a domain-level setting). Add + verify a domain at https://resend.com/domains, enable Open & Click tracking on it, then change `FROM` in the `send-claim-digest` edge function to an address on that domain and redeploy. Until then the `resend-webhook` → `digest_events` pipeline (§16) only records `delivered`/`bounced`, not opens/clicks.

---

## 18. Corridor delay monitor (scouting tool, built 2026-06-15)

A **private, internal** decision-support tool — completely separate from the claim pipeline — to answer "which train corridor should we build next?" by ranking corridors by how badly/often they're delayed over time.

**What it monitors.** The TV collector `collect-train-announcements` (§15) now also polls **Stockholm C (`Cst`)** alongside Malmö C (`Mc`, already polled) — add more monitored hubs by appending their `LocationSignature` to the function's `STATIONS` array and redeploying. These hubs are **monitoring-only**: they are NOT claimable corridors.

**Leak fence (important).** `Cst` is excluded in `int_stop_events`'s TV CTE (`location_signature not in ('Cst')`) so Stockholm never reaches `fct_journeys` / `dim_active_stations` / the Skånetrafiken dropdowns. The chain otherwise pulls *every* TV-polled Swedish station, so any new monitoring-only hub must likewise be added to that exclusion list, or it leaks into the claim UI on the next `dbt build`. **To launch a monitored station as a real claim corridor, just remove it from the exclusion list** — the chain picks it up automatically. (Operator/ticket-seller gating of the public views was considered as the fence and deferred — the journey `operator` label is too messy to filter on safely: ~2,335 `null`-operator corridor journeys, and the same Öresund train surfaces as `Skånetrafiken`/`Öresundståg`/`VR Sverige AB` across legs.)

**The models** (both in `dbt_dev`, read `stg_train_announcements` directly — TV-only, decoupled from the claim chain):
- `dbt/models/marts/agg_corridor_delays_daily.sql` — incremental TABLE, grain `(hub_signature, direction, counterpart_signature, operator, service_date)`. "Corridor" = the train's terminus labels on each TV announcement (`from_location` for inbound arrivals, `to_location` for outbound departures — these are **signature codes**, not names). Daily counts: `n_services`, `n_measured`, `n_late_5` (≥5 min), `n_late_20` (≥20 min), `n_cancelled`, `sum_delay_seconds`, `max_delay_seconds`. **Accumulates past the 14 d raw prune** (§13 pattern — every run reprocesses the last 14 d, older daily rows persist; pre_hook caps at 400 d). `--full-refresh` collapses history to the ~14 d raw window — don't.
- `dbt/models/marts/agg_corridor_delays.sql` — VIEW, the ranking. Rolls the daily table up across all retained days, resolves signatures → station names via `ref_stations` (Danish `Dk.*` stay as codes), and ranks worst-first by `n_late_20`. Read it: `select * from dbt_dev.agg_corridor_delays order by n_late_20 desc limit 20;`

No public wrapper, no anon grant, no pg_cron (refreshes with the scheduled `dbt build`).
