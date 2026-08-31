# Strava → Google Calendar

Copies completed Strava activities into a dedicated Google Calendar once a day,
so the calendar shows what was trained and when.

Personal, single-user, one-way. No database, no server, no web interface — a
single Python script on a GitHub Actions schedule. It reads from Strava, writes
to one Google Calendar, and sends activity data nowhere else. It never writes
anything back to Strava.

```
strava-calendar-sync/
├── sync.py                 the whole thing
├── requirements.txt
├── state/last_sync.json    watermark: the newest activity synced so far
└── README.md
.github/workflows/strava-calendar-sync.yml     the daily schedule
```

> The workflow lives at the repository root because GitHub only reads workflows
> from `.github/workflows/`. Everything else is self-contained in this folder,
> so it can be lifted into a repository of its own by moving these four files
> and dropping the `working-directory:` lines from the workflow.

---

## Setup

### 1. Add the repository secrets

**Settings → Secrets and variables → Actions → New repository secret.**

| Secret | What it is |
|---|---|
| `STRAVA_CLIENT_ID` | Strava API application client ID |
| `STRAVA_CLIENT_SECRET` | Strava API application client secret |
| `STRAVA_REFRESH_TOKEN` | Long-lived refresh token, scope `activity:read_all` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The whole service account key JSON, pasted as one line |
| `GOOGLE_CALENDAR_ID` | Calendar ID of the dedicated Training calendar |

### 2. Find the calendar ID

Google Calendar → hover the Training calendar in the left sidebar → **⋮** →
**Settings and sharing** → **Integrate calendar** → **Calendar ID**. It looks
like `abc123…@group.calendar.google.com` (for the primary calendar it is just
your email address, but use a dedicated calendar — this script only ever writes
to the one ID it is given).

### 3. Share the calendar with the service account

On that same settings page, under **Share with specific people or groups**, add
the service account's `client_email` (it is inside the key JSON, ending
`…@….iam.gserviceaccount.com`) with **Make changes to events**.

Without this, runs fail with `404 Not Found` on the calendar — the service
account genuinely cannot see a calendar that has not been shared with it.

That is all. The first scheduled run picks it up from there.

---

## Running it

### Daily, automatically

`.github/workflows/strava-calendar-sync.yml` runs at **03:20 UTC**, which is
04:20 or 05:20 in Sweden depending on daylight saving. GitHub's free-tier
scheduler is best-effort and can drift by an hour or more; that is harmless
here, because what gets fetched is decided by the watermark, not by the clock.

### Manually

**Actions → Strava to Google Calendar sync → Run workflow.** Two optional
inputs:

- **`dry_run`** — list what would be created, write nothing (neither to the
  calendar nor to the watermark).
- **`since`** — `YYYY-MM-DD`. Ignore the watermark and fetch from that date
  (00:00 UTC) instead. This is how you backfill.

### Backfilling

Set `since` to the date you want to start from and run the workflow. Anything
already in the calendar comes back as a duplicate and is skipped, so it is safe
to run a wide backfill over dates that are partly synced already. Strava's page
limit is 100 activities per request and the script pages until the list is
exhausted; a multi-year backfill is a few requests, nowhere near the rate limit.

Do a `dry_run` first if you want to see the shape of it before it writes.

### Locally

```bash
cd strava-calendar-sync
pip install -r requirements.txt

export STRAVA_CLIENT_ID=…
export STRAVA_CLIENT_SECRET=…
export STRAVA_REFRESH_TOKEN=…
export GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"
export GOOGLE_CALENDAR_ID=…

python sync.py --dry-run                  # look first
python sync.py                            # then write
python sync.py --since 2026-01-01         # one-off backfill
```

`--dry-run` only talks to Strava, so the two Google variables can be left unset
for it.

Keep the key file out of the repository — `.gitignore` already covers `.env*`,
but a stray `service-account.json` is not ignored, so put it somewhere else
entirely.

---

## Reading the logs when a run fails

**Actions → the failed run → the `sync` job → the `Sync activities` step.** The
last line before the failure is the error. Common ones:

| What you see | What it means |
|---|---|
| `Strava rejected the token refresh (HTTP 400/401)` | `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` or `STRAVA_REFRESH_TOKEN` is wrong or expired. Re-issue the refresh token and update the secret. |
| `Strava returned a NEW refresh token (sha256:…)` | Strava rotated the token; the stored one is now dead. Run `python sync.py` locally — it prints the new value to stderr there (never in a CI log) — and paste it into the secret. |
| `Strava rejected the access token (HTTP 401)` | The token is valid but lacks `activity:read_all`, or access was revoked in Strava's settings. |
| `Strava's … rate limit is nearly exhausted` | 200 requests per 15 minutes, 2,000 per day. The run stopped before being blocked and wrote nothing; wait 15 minutes and re-run. |
| `Google Calendar rejected event strava… (HTTP 404)` | The calendar ID is wrong, or the calendar has not been shared with the service account. |
| `Google Calendar rejected event strava… (HTTP 403)` | The service account has read-only access; it needs **Make changes to events**. |
| `GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON` | The key was pasted with the newlines mangled. Re-paste the file contents verbatim. |
| `Missing required environment variable …` | The secret is not set, or is set on the wrong repository/environment. |

A successful run ends with a line like:

```
Done: 3 fetched, 2 created, 1 skipped as duplicates, 0 failed.
```

A run with nothing new says so and stops — that is a success, not a problem.

If any activity fails, the run exits non-zero **and leaves the watermark
untouched**, so the next run retries it. Anything already created comes back as
a duplicate and is skipped.

---

## How it decides what to sync

`state/last_sync.json` holds the start time of the newest activity synced so
far. Each run asks Strava for activities started after that, and advances it
only after a fully successful run. It is committed back to the repository by the
workflow (with `[skip ci]`, so it does not re-trigger the other workflows here),
and only when it actually changed.

If the file is missing or its watermark is `null`, the run backfills
`BACKFILL_DAYS` (default 30) instead.

Each run actually queries from **two days before** the watermark. An activity
recorded on Saturday but uploaded on Monday has a start time behind the
watermark and would otherwise be missed permanently. Re-fetching costs one
request and creates nothing new, because of how duplicates are handled.

### Duplicates

The Google Calendar event ID is set explicitly to `strava` + the Strava activity
ID, rather than letting Google generate one. Google requires base32hex
characters — lowercase `a`–`v` and digits `0`–`9`, 5 to 1024 long — which that
satisfies.

So the same activity always maps to the same event ID, and re-creating it
returns HTTP 409, which is treated as "already synced" and skipped. Running the
script twice in a row creates zero duplicates; so does a backfill overlapping
already-synced dates.

### Timezones

Strava returns `start_date` (the true instant, UTC), `start_date_local` (the
local wall clock, but serialised with a misleading `Z` suffix, so it is *not* a
UTC timestamp), and `timezone` / `utc_offset`.

Events are built from `start_date` and rendered with the activity's own UTC
offset, tagged with the IANA zone name from `timezone`. An activity recorded in
Tokyo is therefore stored as the moment it actually happened, tagged
`Asia/Tokyo`, and displays at the right local hour wherever the calendar is
viewed from. Using `start_date_local` instead would shift every activity
recorded abroad. The reasoning is repeated in a comment above `to_event()`.

*(On Windows, `zoneinfo` has no timezone database unless `pip install tzdata`.
Without it the IANA name is dropped and only the numeric offset is sent — the
event is still at the correct instant, it just carries less metadata. On the
Linux runner this never applies.)*

### What each event looks like

- **Title** — sport type and name, e.g. `Run: Morning ride along Årstaviken`
- **Time** — activity start, to start plus `elapsed_time`
- **Description** — distance, moving time, elevation gain, average and max heart
  rate, average power, and a link back to the activity. Fields Strava did not
  supply are left out rather than shown as zero.

## Configuration

Everything is an environment variable; there are no credentials in the code.

| Variable | Default | What it does |
|---|---|---|
| `BACKFILL_DAYS` | `30` | How far back the first run reaches when there is no watermark |
| `SYNC_OVERLAP_DAYS` | `2` | How far before the watermark each run re-queries, to catch late uploads |
| `STATE_FILE` | `state/last_sync.json` | Where the watermark lives |
