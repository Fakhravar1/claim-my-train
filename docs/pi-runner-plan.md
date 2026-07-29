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

**b) The HLT geo-block cannot be fixed with money — but is DEFERRED here.**
CLAUDE.md §19: `respons.hlt.se` black-holes GitHub's US/Azure runners while
serving EU IPs. A Pi on a Swedish home connection is the documented fix ("cheap
EU VPS / Fly.io `arn` / self-hosted EU runner") and pre-empts the same block on
the other `respons`-vendor operators (Blekingetrafiken, Kalmar). **This is a
later upgrade, not a driver of Phase 1** — see the scope decision in §2. Nothing
regresses by deferring it: HLT is already EXTERNAL and backlogged.

**c) The alerting plane shares fate with what it monitors.** During this outage
`notify-claude-on-failure.yml` could not fire — it is also `runs-on:
ubuntu-latest`, so the catch-all failure notifier died with everything else. The
§10 Supabase-side freshness watchdog *did* fire correctly (emailed 06:00, then
6-hourly reminders), which is precisely because it lives outside GitHub.

### Honest counter-argument, stated up front

Problem (a) is solvable with money: raising the spending limit costs
$0.008/min ≈ $16/month for the overage, or GitHub Team at $4/month gives 3 000
included minutes. With the browser workflows deferred (§2), the Pi's remaining
justification is **cost and cadence freedom** — both of which money also buys.
The EU-IP advantage (b) is real and unpurchasable, but it is not being cashed in
this phase.

What tips it: **the Pi is already owned.** Capital cost is zero, running cost is
a few watts, against ~$192/year in perpetuity for the paid alternative. If the Pi
had to be bought, buying minutes would be the rational choice at this scope —
worth remembering if the Pi ever dies and a replacement is being considered.

The one thing money buys that the Pi does not: no new failure domain. See §6.

---

## 2. What moves, what stays

### Measured burn (run history, 2026-07-29)

Billed as `ceil` to the whole minute **per job**, which is why short-but-frequent
workflows cost more than their runtime suggests.

| Workflow | Runs/day | Billed/run | Est. per month | Share |
|---|---|---|---|---|
| `dbt-run` | 24 (hourly) | **3 min** (157–181 s) | **~2 160** | **~81 %** |
| `claim-pdf-worker` | ~11 | 1 min (9–18 s) | ~330 | ~12 % |
| `claim-canary` | 1 | ~3 min | ~90 | ~3 % |
| `refresh-station-stats` | 1 | ~2 min | ~60 | ~2 % |
| `mirror-to-lovable` + notify | ~1–2 | 1 min | ~45 | ~2 % |
| | | | **~2 685** vs 2 000 quota | |

Sample caveat: the runs API returned 30 runs per workflow, of which 6 `dbt-run`
successes — but their spread is tight (157–181 s), so the 3 min figure is solid.
`claim-pdf-worker`'s cadence is the *observed* ~11/day, not the nominal 96 that
`*/15` implies: GitHub's free-tier scheduler drops most fires (measured gaps of
1–3 h).

### Scope decision (2026-07-29): move `dbt-run` ONLY

`dbt-run` is 81 % of the burn by itself. Moving it alone takes the account to
~525 min/month — about a quarter of quota. The browser workflows are ~15 %
combined and cost what they cost only because of per-job rounding; moving them
buys little and drags the whole arm64 Playwright/Chromium problem into Phase 1.

Deciding factor is risk, not cost: `dbt-run` needs **no browser** — Python,
`dbt-core`, `dbt-postgres`, psycopg2, all clean aarch64 wheels. The claim path,
which touches real user money and live operator submissions, stays on proven
hosted infrastructure.

| Workflow | Cadence | Destination | Reason |
|---|---|---|---|
| `dbt-run.yml` | hourly | **Pi** | 81 % of the burn. No browser dependency. Unlocks restoring 15-min cadence for free. |
| `claim-pdf-worker.yml` | `*/15` | **stays on GitHub** | ~12 % of burn. Deferred: keeps Chromium/arm64 out of Phase 1 and leaves the money-touching path on proven infra. Revisit only if the HLT geo-block becomes worth solving. |
| `claim-canary.yml` | daily | **stays on GitHub** | ~3 % of burn. Same reasoning; nothing to gain by moving it first. |
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

- **4 GB is plenty at this scope.** With the browser workflows staying on GitHub
  (§2), the only workload is dbt — a Postgres client, not a memory hog. 8 GB only
  matters if Chromium is added later.
- **Boot from a USB 3.0 SSD, not microSD.** The runner work dir churns constantly
  (checkouts, pip caches); SD cards die from this. The Pi 4 supports USB boot
  with an up-to-date bootloader (no NVMe — that is Pi 5 + HAT).
- **Active cooling.** A Pi 4 throttles hard without a heatsink/fan. An hourly dbt
  build is not sustained load, so this is less critical than it would be for
  browser work — but it is cheap insurance.
- **A real 3 A USB-C PSU.** Undervoltage on a Pi 4 with a bus-powered SSD
  produces bizarre intermittent failures that look like software bugs.
- Wired ethernet. Runner polls outbound only — **no port forwarding, no inbound
  ports, works fine behind CGNAT and a dynamic IP.**

### OS: Ubuntu Server 24.04 LTS **arm64**, not Raspberry Pi OS
Matching `ubuntu-latest` as closely as possible is what lets the *same workflow
YAML* run on both runners without divergent steps — and untested divergent steps
are how a failsafe silently rots.

At dbt-only scope this is a **low-stakes** choice (Raspberry Pi OS would also
work — there is no Chromium involved). Ubuntu is still the default because it
costs nothing now and keeps the door open: if browser workflows are ever moved,
Playwright publishes arm64 Chromium for Ubuntu 22.04/24.04 while Debian is
best-effort.

### Runner install
- Register with label `qvitta-pi` (plus the implicit `self-hosted`).
- Dedicated unprivileged user (`github-runner`), **no sudo, no login shell**.
- Install as a systemd service (`./svc.sh install && ./svc.sh start`) so it
  survives reboot. Leave runner auto-update on.

### arm64 items to verify during setup

At dbt-only scope there is exactly **one** real unknown:

1. **`actions/setup-python` on linux-arm64.** `actions/python-versions` arm64
   coverage is recent and incomplete. If it fails to resolve, pre-seed the tool
   cache at `$RUNNER_TOOL_CACHE/Python/3.11.<x>/arm64/` with a `.complete`
   marker; setup-python then resolves locally and **the workflow file stays
   identical**. Do not branch the YAML on `runner.environment` — that is how the
   two paths drift. (`dbt-run.yml` pins 3.11.)
2. `dbt-core`, `dbt-postgres`, `psycopg2` — pure Python plus an aarch64 manylinux
   wheel. Expected to be uneventful; verify by running `dbt build` by hand.

Deferred with the browser workflows (§2), relevant only if they are moved later:
Playwright arm64 Chromium (`playwright install --with-deps chromium`, fallback
apt `chromium` + `executablePath`), and confirming from the Pi that
`respons.hlt.se` actually renders on a Swedish residential IP before counting on
the geo-block fix.

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
registered as `qvitta-pi` and idle. Validate by hand on the Pi: `dbt build`
against the session pooler, and the `setup-python` tool-cache question from §4.
No workflow changes yet. **Exit criterion: a clean `dbt build` from the Pi.**

**Phase 2 — move `dbt-run`.** Add the `runner` input, build the
`dispatch-workflow` edge function + PAT, point pg_cron at it, retire the
cron-jobs.org job for dbt (removing an external dependency — §3). Keep cadence
hourly at first. Watch for a week: confirm zero minutes consumed, and force a
fallback by powering the Pi off to prove the router flips to `ubuntu-latest`.

**Phase 3 — spend the headroom.** Restore `dbt build` to 15 min, reverting the
2026-07-07 cost cut and dropping freshness lag from ≤1 h to ≤15 min. This is free
on the Pi. Update CLAUDE.md §3 and §10 to describe the new topology.

**Phase 4 (OPTIONAL, deferred) — the browser workflows.** Only if the HLT
geo-block becomes worth solving. Move `claim-pdf-worker` and `claim-canary`,
drop their in-repo `schedule:` in favour of the router (also removing GitHub's
1–3 h scheduling jitter), resolve the arm64 Chromium items in §4, and if the
block is confirmed cleared, flip Hallandstrafiken from EXTERNAL to the headless
worker (§19) and retire `diag-hlt.yml`. Nothing in Phases 1–3 depends on this.

---

## 6. Risks

- **Home hardware becomes production infrastructure.** Power cuts, ISP outages,
  someone unplugging it. Mitigated by the router + watchdog, not eliminated.
- **The fallback burns minutes exactly when you are not watching.** Bounded at
  dbt-only scope: hosted `dbt-run` costs ~72 min/day, against ~1 475 min/month of
  headroom once dbt moves off — roughly **20 days of continuous fallback** before
  quota trouble. That is what makes the failsafe credible rather than theoretical.
  Still: decide the spending limit deliberately rather than discovering it the way
  the 2026-07-28 outage was discovered.
- **Secret exposure.** At dbt-only scope the Pi receives just the five
  `SUPABASE_DB_*` secrets (session-pooler credentials). It never sees
  `SUPABASE_SERVICE_ROLE_KEY` or `LOVABLE_MIRROR_PAT`, because the workflows
  holding those stay hosted (§2) — a meaningful narrowing of blast radius, and a
  reason to keep the split even if browser workflows move later.
- **Self-hosted runners persist state between jobs** (unlike ephemeral hosted
  ones). Leaked files, caches and env can carry across runs. Acceptable for a
  private single-owner repo; would not be for a public one.
- **Two environments to keep in sync.** Ubuntu 24.04 arm64 plus an identical
  workflow file is the mitigation, but the fallback path will be exercised
  rarely — schedule a deliberate failover test (power the Pi off) each time the
  workflows change materially, or it will be broken when it is needed.
