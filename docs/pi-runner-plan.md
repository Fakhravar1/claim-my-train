# Raspberry Pi self-hosted runner — plan

Status: **PROPOSED** (nothing implemented). Written 2026-07-29, during the
Actions-minutes outage described below.

Goal: move the recurring GitHub Actions workloads onto a Raspberry Pi so they
cost no Actions minutes and run from a Swedish IP, while keeping GitHub-hosted
runners as an automatic failsafe when the Pi is unavailable.

---

## 1. Why

Three separate problems, one fix.

**a) Actions minutes are the binding constraint — and they just ran out.**
On 2026-07-28 at ~10:00 UTC both `dbt run` and `Claim PDF worker` began failing
at dispatch (`runner_id: 0`, no runner assigned, dead in 3–13 s, no logs). The
account's included minutes were exhausted. Consequences measured 2026-07-29:

- `int_stop_events` 1453 min stale vs a 360 min threshold; `v_journeys` frozen
  at `origin_local_date = 2026-07-28`. The board, `v_claimable_journeys` and the
  digest all stopped moving.
- Ingestion was **unaffected** (tv_raw 1 min old, rest_raw 13 min) — the pg_cron
  collectors live inside Supabase. The outage is exactly the GitHub-hosted slice.
- No claims were lost: zero rows in `pending`/`*_authorized`.

This is the second time minutes have forced a product decision — CLAUDE.md §3
already records cutting `dbt build` from 15 min to hourly on 2026-07-07 at ~90 %
of quota 6 days into the cycle, plus the PR #12 preflight/pip-cache work.
Measured burn is ~75–85 min/day (hourly dbt ≈ 24 × ~2.5 min, plus the worker and
the daily jobs), which consumes 2 000 minutes in ~26 days. The July cycle ran out
on the 28th. That is a structural deficit, not a spike.

**b) The HLT geo-block cannot be fixed with money.** CLAUDE.md §19:
`respons.hlt.se` black-holes GitHub's US/Azure runners while serving EU IPs. A Pi
on a Swedish home connection is the documented fix ("cheap EU VPS / Fly.io
`arn` / self-hosted EU runner") and pre-empts the same block on the other
`respons`-vendor operators (Blekingetrafiken, Kalmar).

**c) The alerting plane shares fate with what it monitors.** During this outage
`notify-claude-on-failure.yml` could not fire — it is also `runs-on:
ubuntu-latest`, so the catch-all failure notifier died with everything else. The
§10 Supabase-side freshness watchdog *did* fire correctly (emailed 06:00, then
6-hourly reminders), which is precisely because it lives outside GitHub.

### Honest counter-argument, stated up front

Problem (a) is solvable with money: raising the spending limit costs
$0.008/min ≈ $16/month for 2 000 extra minutes, or GitHub Team at $4/month gives
3 000. That is far less effort than a Pi. **The Pi's unique value is (b) and the
freedom to raise cadence without watching a meter** — the EU IP is not purchasable
on GitHub-hosted runners at any price. If (b) stops mattering, buying minutes is
the rational choice. Proceed on that basis, not on cost alone.

Rough economics: Pi 5 8 GB + PSU + SSD ≈ 1 500–2 000 SEK one-off, ~3–5 W idle.
Break-even vs $16/month overage is roughly 9–12 months.

---

## 2. What moves, what stays

| Workflow | Cadence | Destination | Reason |
|---|---|---|---|
| `dbt-run.yml` | hourly | **Pi** | Biggest consumer (~60 min/day). Pure Postgres client work, no browser. Unlocks restoring 15-min cadence for free. |
| `claim-pdf-worker.yml` | `*/15` | **Pi** | Second-biggest. Swedish IP unblocks `submit_hallandstrafiken`. Enables ~5-min filing latency. |
| `claim-canary.yml` | daily | **Pi** | Same Chromium need; EU IP makes results representative and lets the canary finally cover the HLT form. Low burn, low priority — move last. |
| `refresh-station-stats.yml` | daily | **stays on GitHub** | Pushes commits to `main` and mirrors to the Lovable companion; keeps `LOVABLE_MIRROR_PAT` off the Pi. ~30–60 min/month is affordable. |
| `mirror-to-lovable.yml` | on push | **stays on GitHub** | Push-triggered prod deploy path. Must be instant and must never depend on the Pi being up. |
| `notify-claude-on-failure.yml` | `workflow_run` | **stays on GitHub — mandatory** | The alerting plane must not share fate with what it watches. Keeping it hosted is what lets it report a Pi outage. |
| `diag-hlt.yml`, `respons-spike.yml` | manual | leave | One-offs. `diag-hlt` becomes obsolete once the Pi proves EU access. |

Secret blast radius follows this split: the Pi only ever receives the Supabase
secrets (`SUPABASE_DB_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). The
GitHub PATs (`LOVABLE_MIRROR_PAT`, the Claude trigger creds) stay on hosted
runners. Keep it that way.

---

## 3. The failsafe

### The problem GitHub does not solve for you

There is no native "fall back to a hosted runner if the self-hosted one is
offline". A job targeting an offline self-hosted runner does **not** fail — it
**queues silently for up to 24 h**, then gets cancelled. That is strictly worse
than failing, because nothing alerts and the hourly triggers pile up behind it.
`timeout-minutes` does not help: it starts counting when the job starts, not
while queued.

So the runner choice has to be made *before* dispatch, by something that is
neither the Pi nor a GitHub-hosted job.

### Design: a Supabase edge function routes each trigger

This reuses the pattern the project already uses everywhere else (pg_cron → edge
function → outbound API call, exactly like `fire-claude-investigator`).

```
pg_cron  ──POST──▶  dispatch-workflow (edge fn, verify_jwt=false + isServiceBearer)
                          │
                          │ 1. GET /repos/:owner/:repo/actions/runners   (PAT, Administration:read)
                          │ 2. any runner labelled `qvitta-pi` with status=online ?
                          │      yes → runner=qvitta-pi        (0 Actions minutes)
                          │      no  → runner=ubuntu-latest    (failsafe, burns minutes)
                          │ 3. cancel any run of this workflow stuck in `queued`
                          ▼
                    POST /actions/workflows/:file/dispatches  { inputs: { runner } }
```

Workflow side — one file, two possible runners, no duplicated job logic:

```yaml
on:
  workflow_dispatch:
    inputs:
      runner:
        description: Runner to execute on
        type: choice
        options: [qvitta-pi, ubuntu-latest]
        default: qvitta-pi

jobs:
  run:
    if: github.repository == 'Fakhravar1/claim-my-train'
    runs-on: ${{ inputs.runner || 'qvitta-pi' }}
```

Notes:
- `inputs` **is** available in the `runs-on` context, alongside `github`, `needs`,
  `strategy`, `matrix` and `vars`.
- `type: choice` constrains the value, so a typo can never produce a label that
  matches nothing and queues forever.
- `|| 'qvitta-pi'` covers non-dispatch events (manual re-runs, any leftover
  `schedule:`).
- The probe costs **zero Actions minutes** — it happens in Supabase, not in a
  hosted job. A probe implemented as an `ubuntu-latest` job would cost 1 billed
  minute per run (720/month at hourly), which would defeat the whole exercise.

Requires one new fine-grained PAT with repo permissions **Administration: read**
(to list runners) and **Actions: read and write** (to dispatch and cancel). The
default `GITHUB_TOKEN` cannot list runners — `administration` is not among the
scopes it can be granted.

### Second layer: the freshness watchdog re-dispatches

The router handles "Pi offline at dispatch time". It does not handle "Pi accepted
the job, then died mid-run" or "the router itself failed". For that, extend the
existing `check-data-freshness` edge function (§10): when `int_stop_events`
breaches, in addition to emailing, dispatch `dbt-run.yml` with
`runner=ubuntu-latest`. Runs every 30 min already, costs nothing when healthy,
and self-heals within one cycle.

### Third layer, cheap: stale-queue guard

Step 3 of the router — cancel `queued` runs of the same workflow before
dispatching. Prevents a pile-up if the Pi goes offline between the probe and the
job being picked up.

### What each layer would have done today

Nothing, honestly — with minutes exhausted, no hosted fallback can run either.
The Pi's value today is that it would have been running normally and this outage
would not have happened. The layers protect against the *inverse* failure (Pi
down, GitHub fine), which is the failure mode the Pi introduces.

---

## 4. Build

### Hardware — **Raspberry Pi 4** (confirmed on hand, 2026-07-29)
A Pi 4 is comfortably enough for this workload. Expect `dbt build` to take
noticeably longer than GitHub's runners (minutes, not seconds) — irrelevant at
hourly or 15-min cadence, since nothing downstream is latency-sensitive.

- **4 GB is workable, 8 GB is comfortable.** dbt is fine either way; Chromium for
  the SJ/Vy/HLT paths is the memory consumer. On 4 GB, add swap (zram) before
  concluding anything is broken.
- **Boot from a USB 3.0 SSD, not microSD.** The runner work dir churns constantly
  (checkouts, pip, Playwright); SD cards die from this. The Pi 4 supports USB
  boot with an up-to-date bootloader (no NVMe — that is Pi 5 + HAT).
- **Active cooling.** A Pi 4 under sustained load throttles hard without a
  heatsink/fan. A runner doing Chromium work is sustained load.
- **A real 3 A USB-C PSU.** Undervoltage on a Pi 4 with a bus-powered SSD
  produces bizarre intermittent failures that look like software bugs.
- Wired ethernet. Runner polls outbound only — **no port forwarding, no inbound
  ports, works fine behind CGNAT and a dynamic IP.**

### OS: Ubuntu Server 24.04 LTS **arm64**, not Raspberry Pi OS
This is the decision that makes the failsafe honest. Playwright publishes arm64
Chromium builds for Ubuntu 22.04/24.04; Debian is best-effort. Matching
`ubuntu-latest` as closely as possible is what lets the *same workflow YAML* run
on both runners without divergent steps — and untested divergent steps are how a
failsafe silently rots.

### Runner install
- Register with label `qvitta-pi` (plus the implicit `self-hosted`).
- Dedicated unprivileged user (`github-runner`), **no sudo, no login shell**.
- Install as a systemd service (`./svc.sh install && ./svc.sh start`) so it
  survives reboot. Leave runner auto-update on.

### arm64 items to verify during setup (each has a fallback)
1. **`actions/setup-python` on linux-arm64.** `actions/python-versions` arm64
   coverage is recent and incomplete. If it fails to resolve, pre-seed the tool
   cache at `$RUNNER_TOOL_CACHE/Python/3.12.<x>/arm64/` with a `.complete`
   marker; setup-python then resolves locally and **the workflow file stays
   identical**. Do not branch the YAML on `runner.environment` — that is how the
   two paths drift.
2. **Playwright Chromium.** `playwright install --with-deps chromium` should work
   on Ubuntu 24.04 arm64. Fallback: apt `chromium` + `executablePath`
   (the project already uses that pattern per the environment notes).
3. `psycopg2-binary`, `reportlab`, `pillow`, `pypdf` — aarch64 manylinux wheels
   all exist; expected to be uneventful.
4. **Verify the geo-block claim before relying on it:** from the Pi, fetch
   `respons.hlt.se` and confirm it renders. This is the whole justification for
   (b); test it early, in Phase 1, not after wiring everything up.

---

## 5. Phasing

**Phase 0 — unblock today's outage (independent of the Pi). PARTLY DONE.**
On 2026-07-29 the board was unfrozen by hand-running the compiled model SQL for
`int_stop_events` and `fct_claimable_stop_events` through the Supabase SQL API
(delete+insert on `stop_event_key`, matching dbt's incremental strategy).
`v_journeys` and `v_claimable_journeys` returned to `2026-07-29`; grain and
`assert_claimable_layer_covers_fct_journeys` both verified clean afterwards.

**That was a one-shot, not a repair.** `dbt run` still fails on every trigger
until the minutes quota resets or the spending limit is raised, so the board goes
stale again within the 360-min watchdog threshold (~6 h). Until the Pi is
serving, the only two real options are raising the spending limit or repeating
the manual refresh. Two things stay stale under the manual path: the SEO aggs
(`agg_station_delays_daily`, `agg_operator_delays_daily`) and
`dim_active_stations` — both catch up on the next genuine `dbt build`, since the
aggs reprocess a multi-day window.

Note for anyone repeating the manual refresh: `fct_claimable_stop_events` has a
**unique index on `stop_event_key`**, so delete+insert cannot be expressed as one
statement with data-modifying CTEs (the INSERT's uniqueness check does not see
the CTE DELETE). Stage the batch into a table, then DELETE and INSERT inside an
explicit transaction. `int_stop_events` has no unique index and tolerates the
single-statement form.

**Phase 1 — Pi standing, nothing moved.** Hardware, Ubuntu 24.04 arm64, runner
registered and idle. Validate by hand on the Pi: `dbt build` against the pooler,
`playwright install chromium`, a `curl` at `respons.hlt.se`, and the tool-cache
question from §4. No workflow changes yet. **Exit criterion: all four verified.**

**Phase 2 — move `dbt-run` only.** Add the `runner` input, build the
`dispatch-workflow` edge function + PAT, point pg_cron at it, retire the
cron-jobs.org job for dbt (removing an external dependency — §3). Keep cadence
hourly at first. Watch for a week: confirm zero minutes consumed, and force a
fallback by powering the Pi off to prove the router flips to `ubuntu-latest`.

**Phase 3 — move `claim-pdf-worker`, then `claim-canary`.** Drop the in-repo
`schedule:` in favour of the router (also removes GitHub's scheduling jitter,
which is currently 1–3 h on that workflow). If the HLT geo-block is confirmed
cleared, flip Hallandstrafiken from EXTERNAL to the headless worker (§19) and
retire `diag-hlt.yml`.

**Phase 4 — spend the headroom.** Restore `dbt build` to 15 min (reverting the
2026-07-07 cost cut, dropping freshness lag from ≤1 h to ≤15 min) and the worker
to ~5 min. Update CLAUDE.md §3, §10, §19 to describe the new topology.

---

## 6. Risks

- **Home hardware becomes production infrastructure.** Power cuts, ISP outages,
  someone unplugging it. Mitigated by the router + watchdog, not eliminated.
- **The fallback burns minutes exactly when you are not watching.** A week-long
  Pi outage puts you back over quota. Decide the spending limit deliberately
  rather than discovering it the way today's outage was discovered.
- **Secret exposure.** Supabase DB password and `SUPABASE_SERVICE_ROLE_KEY` land
  on the Pi at job time; a compromised Pi means compromised Supabase. The
  workflow split in §2 keeps the GitHub PATs off the device, which bounds it.
- **Self-hosted runners persist state between jobs** (unlike ephemeral hosted
  ones). Leaked files, caches and env can carry across runs. Acceptable for a
  private single-owner repo; would not be for a public one.
- **Two environments to keep in sync.** Ubuntu 24.04 arm64 plus an identical
  workflow file is the mitigation, but the fallback path will be exercised
  rarely — schedule a deliberate failover test (power the Pi off) each time the
  workflows change materially, or it will be broken when it is needed.
