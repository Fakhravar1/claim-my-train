#!/usr/bin/env python3
"""Copy completed Strava activities into a dedicated Google Calendar.

Single user, no database, no server, no web interface: run once a day from
GitHub Actions. Every input arrives as an environment variable (see README.md);
nothing is ever written back to Strava.

    python sync.py                     # normal run
    python sync.py --dry-run           # show what would be created, write nothing
    python sync.py --since 2026-01-01  # one-off backfill from a given date
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Sequence
from zoneinfo import ZoneInfo

import requests

LOG = logging.getLogger("strava-sync")

STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"
STRAVA_ACTIVITY_URL = "https://www.strava.com/activities/{activity_id}"
GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.events"]

PER_PAGE = 100
MAX_PAGES = 100          # 10k activities per run; a backstop against a paging bug looping forever
HTTP_TIMEOUT = 30        # seconds
MAX_ATTEMPTS = 4         # 1 try + 3 retries, backing off 1s / 2s / 4s
RATE_LIMIT_ABORT_RATIO = 0.9

DEFAULT_BACKFILL_DAYS = 30
DEFAULT_OVERLAP_DAYS = 2
MIN_EVENT_SECONDS = 60   # Google dislikes zero-length timed events

# Google Calendar event ids must be base32hex: lowercase a-v and digits 0-9,
# 5 to 1024 characters. "strava" + the numeric activity id satisfies that.
EVENT_ID_PREFIX = "strava"
EVENT_ID_RE = re.compile(r"^[a-v0-9]{5,1024}$")

# Resolved from the script's own location, so the state file is found no matter
# what the working directory is when the script is invoked.
DEFAULT_STATE_PATH = Path(__file__).resolve().parent / "state" / "last_sync.json"

STATE_NOTE = (
    "Watermark for the Strava -> Google Calendar sync. Written by sync.py after a "
    "fully successful run. A null watermark means 'never synced': the next run "
    "falls back to BACKFILL_DAYS (default 30)."
)


class SyncError(RuntimeError):
    """A failure that should end the run with a non-zero exit status."""


class RateLimitReached(SyncError):
    """Strava's rate limit is exhausted or close to it. Stop before we get blocked."""


# What a surprising Strava payload raises while being mapped to an event. Caught
# per activity so one odd entry is reported and skipped rather than failing the run.
MAPPING_ERRORS = (SyncError, ValueError, TypeError, KeyError)


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class Config:
    strava_client_id: str
    strava_client_secret: str
    strava_refresh_token: str
    google_service_account_json: str | None
    google_calendar_id: str | None
    backfill_days: int
    overlap_days: int
    state_path: Path


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SyncError(f"Missing required environment variable {name}.")
    return value


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise SyncError(f"{name} must be a whole number, got {raw!r}.") from exc
    if value < 0:
        raise SyncError(f"{name} must not be negative, got {value}.")
    return value


def load_config(*, need_google: bool) -> Config:
    """Read configuration from the environment.

    Google credentials are only required for a real run: --dry-run touches
    Strava alone, so it stays usable without them.
    """
    state_path = Path(os.environ.get("STATE_FILE", "").strip() or DEFAULT_STATE_PATH)
    return Config(
        strava_client_id=_require_env("STRAVA_CLIENT_ID"),
        strava_client_secret=_require_env("STRAVA_CLIENT_SECRET"),
        strava_refresh_token=_require_env("STRAVA_REFRESH_TOKEN"),
        google_service_account_json=(
            _require_env("GOOGLE_SERVICE_ACCOUNT_JSON") if need_google else None
        ),
        google_calendar_id=_require_env("GOOGLE_CALENDAR_ID") if need_google else None,
        backfill_days=_int_env("BACKFILL_DAYS", DEFAULT_BACKFILL_DAYS),
        overlap_days=_int_env("SYNC_OVERLAP_DAYS", DEFAULT_OVERLAP_DAYS),
        state_path=state_path,
    )


# --------------------------------------------------------------------------- #
# HTTP plumbing
# --------------------------------------------------------------------------- #

def _sleep_backoff(attempt: int, reason: str) -> None:
    delay = min(2 ** (attempt - 1), 8)
    LOG.warning("%s — retrying in %ds (attempt %d of %d).", reason, delay, attempt + 1, MAX_ATTEMPTS)
    time.sleep(delay)


def request_with_retries(
    session: requests.Session, method: str, url: str, **kwargs: Any
) -> requests.Response:
    """Send a request, retrying transient 5xx responses and connection errors.

    Request bodies are never logged — they carry the Strava client secret.
    """
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = session.request(method, url, timeout=HTTP_TIMEOUT, **kwargs)
        except requests.RequestException as exc:
            if attempt == MAX_ATTEMPTS:
                raise SyncError(
                    f"{method} {url} failed after {MAX_ATTEMPTS} attempts: {exc}"
                ) from exc
            _sleep_backoff(attempt, f"{method} {url} hit a connection error ({type(exc).__name__})")
            continue

        if response.status_code >= 500 and attempt < MAX_ATTEMPTS:
            _sleep_backoff(attempt, f"{method} {url} returned HTTP {response.status_code}")
            continue
        return response

    raise SyncError(f"{method} {url} exhausted its retries.")  # pragma: no cover - unreachable


def _parse_counts(header_value: str | None) -> list[int]:
    """Parse a Strava rate-limit header, e.g. '200,2000' -> [200, 2000]."""
    if not header_value:
        return []
    counts = []
    for part in header_value.split(","):
        part = part.strip()
        if not part.isdigit():
            return []
        counts.append(int(part))
    return counts


def check_rate_limits(headers: Any) -> None:
    """Abort before Strava starts refusing us.

    Strava reports two windows per bucket: 15-minute (200) and daily (2,000).
    Newer responses also carry read-specific counters; whichever is closest to
    its ceiling wins.
    """
    buckets: list[tuple[str, int, int]] = []
    for limit_key, usage_key, bucket in (
        ("X-RateLimit-Limit", "X-RateLimit-Usage", "overall"),
        ("X-ReadRateLimit-Limit", "X-ReadRateLimit-Usage", "read"),
    ):
        limits = _parse_counts(headers.get(limit_key))
        usages = _parse_counts(headers.get(usage_key))
        for index, (limit, usage) in enumerate(zip(limits, usages)):
            if limit <= 0:
                continue
            window = "15-minute" if index == 0 else "daily"
            buckets.append((f"{bucket} {window}", usage, limit))

    for name, usage, limit in buckets:
        if usage >= limit * RATE_LIMIT_ABORT_RATIO:
            raise RateLimitReached(
                f"Strava's {name} rate limit is nearly exhausted ({usage}/{limit}). "
                "Stopping before we get blocked — nothing was written, so the next "
                "run picks up where this one left off."
            )

    if buckets:
        LOG.debug(
            "Strava rate limits: %s.",
            ", ".join(f"{name} {usage}/{limit}" for name, usage, limit in buckets),
        )


# --------------------------------------------------------------------------- #
# Strava
# --------------------------------------------------------------------------- #

def _warn_rotated_refresh_token(new_token: str) -> None:
    """Tell the operator the stored refresh token is dead, without logging it.

    Strava occasionally rotates the refresh token; when it does, the old one
    stops working and STRAVA_REFRESH_TOKEN has to be updated by hand. The value
    is a secret, so it is never printed into a CI log — only the sha256 prefix,
    which is enough to confirm which value you are holding. On a local run,
    printing it is the only practical way to recover it, so there it goes to
    stderr.
    """
    fingerprint = hashlib.sha256(new_token.encode("utf-8")).hexdigest()[:12]
    LOG.warning(
        "Strava returned a NEW refresh token (sha256:%s). The value stored in "
        "STRAVA_REFRESH_TOKEN is now invalid — update the repository secret or the "
        "next run will fail to authenticate.",
        fingerprint,
    )
    if os.environ.get("GITHUB_ACTIONS", "").lower() == "true":
        LOG.warning(
            "Not printing the new token: this is a CI log. Run `python sync.py` on "
            "your own machine to have it printed, then paste it into the secret."
        )
    else:
        print(f"\nNew Strava refresh token: {new_token}\n", file=sys.stderr)


def get_access_token(session: requests.Session, config: Config) -> str:
    """Exchange the refresh token for a fresh access token.

    Access tokens last six hours, so one is minted per run and never stored.
    """
    LOG.info("Exchanging the Strava refresh token for a fresh access token.")
    response = request_with_retries(
        session,
        "POST",
        STRAVA_TOKEN_URL,
        data={
            "client_id": config.strava_client_id,
            "client_secret": config.strava_client_secret,
            "grant_type": "refresh_token",
            "refresh_token": config.strava_refresh_token,
        },
    )

    if response.status_code != 200:
        detail = ""
        try:
            errors = response.json().get("errors")
            if errors:
                detail = f" Strava said: {json.dumps(errors)}"
        except ValueError:
            pass
        raise SyncError(
            f"Strava rejected the token refresh (HTTP {response.status_code}). Check "
            f"STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET and STRAVA_REFRESH_TOKEN.{detail}"
        )

    payload = response.json()
    access_token = payload.get("access_token")
    if not access_token:
        raise SyncError("Strava's token response contained no access_token.")

    returned_refresh = payload.get("refresh_token")
    if returned_refresh and returned_refresh != config.strava_refresh_token:
        _warn_rotated_refresh_token(returned_refresh)

    expires_in = payload.get("expires_in")
    if isinstance(expires_in, int):
        LOG.info("Access token acquired, valid for about %d minutes.", expires_in // 60)
    else:
        LOG.info("Access token acquired.")
    return access_token


def fetch_activities(
    session: requests.Session, access_token: str, after_epoch: int
) -> list[dict[str, Any]]:
    """List activities started after `after_epoch`, one page at a time."""
    activities: list[dict[str, Any]] = []
    headers = {"Authorization": f"Bearer {access_token}"}

    for page in range(1, MAX_PAGES + 1):
        response = request_with_retries(
            session,
            "GET",
            STRAVA_ACTIVITIES_URL,
            headers=headers,
            params={"after": after_epoch, "page": page, "per_page": PER_PAGE},
        )

        if response.status_code == 429:
            raise RateLimitReached(
                "Strava returned HTTP 429 (rate limit exceeded). Nothing was written; "
                "the next run will pick these activities up."
            )
        check_rate_limits(response.headers)

        if response.status_code == 401:
            raise SyncError(
                "Strava rejected the access token (HTTP 401). The refresh token may "
                "have been revoked, or it lacks the activity:read_all scope."
            )
        if response.status_code != 200:
            raise SyncError(
                f"Strava returned HTTP {response.status_code} while listing activities."
            )

        try:
            batch = response.json()
        except ValueError as exc:
            raise SyncError("Strava returned a non-JSON activity list.") from exc
        if not isinstance(batch, list):
            raise SyncError(f"Expected a list of activities, got {type(batch).__name__}.")

        # Paginate until an empty page comes back — that is Strava's end-of-list signal.
        if not batch:
            break
        LOG.info("Page %d returned %d activities.", page, len(batch))
        activities.extend(batch)
    else:
        raise SyncError(
            f"Stopped after {MAX_PAGES} pages without reaching the end of the list. "
            "Narrow the window with --since, or raise MAX_PAGES."
        )

    return activities


# --------------------------------------------------------------------------- #
# Strava activity -> Google Calendar event
# --------------------------------------------------------------------------- #

def _parse_utc(value: str) -> datetime:
    """Parse a Strava timestamp (`2026-08-30T06:12:09Z`) into an aware datetime."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _activity_offset(activity: dict[str, Any], start_utc: datetime) -> timedelta:
    """The UTC offset in force where and when the activity was recorded."""
    raw = activity.get("utc_offset")
    if isinstance(raw, (int, float)):
        return timedelta(seconds=int(raw))

    # Fallback: start_date_local is the local wall clock, so the difference
    # between it and start_date is the offset.
    local = activity.get("start_date_local")
    if isinstance(local, str) and local:
        naive_local = _parse_utc(local).replace(tzinfo=None)
        return naive_local - start_utc.replace(tzinfo=None)
    return timedelta(0)


def _iana_timezone(activity: dict[str, Any]) -> str | None:
    """Pull the IANA name out of Strava's `timezone` field.

    Strava sends `(GMT+01:00) Europe/Stockholm`; we want the tail.
    """
    raw = str(activity.get("timezone") or "").strip()
    if not raw:
        return None
    candidate = raw.split()[-1]
    if "/" not in candidate:
        return None
    try:
        ZoneInfo(candidate)
    except Exception:
        # No tz database on this machine (Windows without `tzdata`), or an
        # unknown zone. The numeric offset below still pins the instant, so
        # dropping the name only costs a little metadata.
        return None
    return candidate


def _pretty_sport(activity: dict[str, Any]) -> str:
    """`VirtualRide` -> `Virtual Ride`. Strava's sport types are CamelCase."""
    raw = str(activity.get("sport_type") or activity.get("type") or "Activity")
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", raw)


def _hms(seconds: int) -> str:
    hours, remainder = divmod(max(seconds, 0), 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}"


def _describe(activity: dict[str, Any]) -> str:
    """Human-readable summary; fields Strava did not supply are left out."""
    lines: list[str] = []

    distance = activity.get("distance")
    if isinstance(distance, (int, float)) and distance > 0:
        lines.append(f"Distance: {distance / 1000:.2f} km")

    moving_time = activity.get("moving_time")
    if isinstance(moving_time, (int, float)) and moving_time > 0:
        lines.append(f"Moving time: {_hms(int(moving_time))}")

    elevation = activity.get("total_elevation_gain")
    if isinstance(elevation, (int, float)) and elevation > 0:
        lines.append(f"Elevation gain: {elevation:.0f} m")

    average_hr = activity.get("average_heartrate")
    if isinstance(average_hr, (int, float)) and average_hr > 0:
        lines.append(f"Average heart rate: {average_hr:.0f} bpm")

    max_hr = activity.get("max_heartrate")
    if isinstance(max_hr, (int, float)) and max_hr > 0:
        lines.append(f"Max heart rate: {max_hr:.0f} bpm")

    average_watts = activity.get("average_watts")
    if isinstance(average_watts, (int, float)) and average_watts > 0:
        lines.append(f"Average power: {average_watts:.0f} W")

    lines.append("")
    lines.append(STRAVA_ACTIVITY_URL.format(activity_id=activity.get("id")))
    return "\n".join(lines)


def event_id_for(activity_id: Any) -> str:
    event_id = f"{EVENT_ID_PREFIX}{activity_id}"
    if not EVENT_ID_RE.match(event_id):
        raise SyncError(
            f"Activity {activity_id!r} does not produce a valid Google event id "
            f"({event_id!r}); ids must be base32hex, 5-1024 characters."
        )
    return event_id


def to_event(activity: dict[str, Any]) -> dict[str, Any]:
    """Build the Google Calendar event body for one Strava activity.

    Timezone choice
    ---------------
    Strava returns three related fields: `start_date` (the true instant, UTC),
    `start_date_local` (the local wall clock, but serialised with a misleading
    `Z` suffix, so it is NOT a UTC timestamp), and `timezone`
    (`(GMT+01:00) Europe/Stockholm`) alongside `utc_offset` in seconds.

    We build the event from `start_date` — the unambiguous instant — and render
    it with the activity's own UTC offset, taking the IANA zone name from
    `timezone` for the event's `timeZone` field. So a ride recorded in Tokyo is
    stored as the moment it actually happened, tagged `Asia/Tokyo`, and Google
    shows it at the correct local hour in whichever timezone the calendar is
    being viewed from.

    Using `start_date_local` instead would be wrong: parsed as UTC it shifts the
    event by the offset, and parsed as naive it silently assumes the viewer's
    zone, which breaks for any activity recorded abroad.
    """
    activity_id = activity.get("id")
    if activity_id is None:
        raise SyncError("A Strava activity came back with no id.")

    start_raw = activity.get("start_date")
    if not isinstance(start_raw, str) or not start_raw:
        raise SyncError(f"Activity {activity_id} has no start_date.")
    start_utc = _parse_utc(start_raw)

    offset = _activity_offset(activity, start_utc)
    local_start = start_utc.astimezone(timezone(offset))

    elapsed = activity.get("elapsed_time")
    duration = int(elapsed) if isinstance(elapsed, (int, float)) and elapsed > 0 else 0
    local_end = local_start + timedelta(seconds=max(duration, MIN_EVENT_SECONDS))

    start_block: dict[str, str] = {"dateTime": local_start.isoformat()}
    end_block: dict[str, str] = {"dateTime": local_end.isoformat()}
    zone_name = _iana_timezone(activity)
    if zone_name:
        start_block["timeZone"] = zone_name
        end_block["timeZone"] = zone_name

    name = str(activity.get("name") or "Untitled activity").strip()
    return {
        "id": event_id_for(activity_id),
        "summary": f"{_pretty_sport(activity)}: {name}",
        "description": _describe(activity),
        "start": start_block,
        "end": end_block,
    }


# --------------------------------------------------------------------------- #
# Google Calendar
# --------------------------------------------------------------------------- #

def build_calendar_service(config: Config) -> Any:
    """Authenticate as the service account and return a Calendar API client.

    The Google libraries are imported here rather than at module import time so
    that --dry-run works without them being configured.
    """
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    try:
        info = json.loads(config.google_service_account_json or "")
    except json.JSONDecodeError as exc:
        raise SyncError(
            "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. It must hold the whole "
            "service account key file as a single-line string."
        ) from exc

    try:
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=GOOGLE_SCOPES
        )
    except ValueError as exc:
        raise SyncError(f"GOOGLE_SERVICE_ACCOUNT_JSON is not a usable key file: {exc}") from exc

    # The client_email is not a secret, and seeing it makes "did I share the
    # calendar with the right account?" a one-glance check.
    LOG.info("Authenticated with Google as %s.", info.get("client_email", "unknown account"))
    return build("calendar", "v3", credentials=credentials, cache_discovery=False)


def insert_event(service: Any, calendar_id: str, event: dict[str, Any]) -> str:
    """Create one event. Returns 'created' or 'duplicate'."""
    from googleapiclient.errors import HttpError

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            service.events().insert(calendarId=calendar_id, body=event).execute()
            return "created"
        except HttpError as exc:
            status = getattr(exc.resp, "status", None)
            # 409 means an event with this id already exists — the activity was
            # synced on an earlier run. That is the duplicate guard working.
            if status == 409:
                return "duplicate"
            if (status == 429 or (isinstance(status, int) and status >= 500)) and attempt < MAX_ATTEMPTS:
                _sleep_backoff(attempt, f"Google Calendar returned HTTP {status}")
                continue
            reason = getattr(exc, "reason", "") or "no reason given"
            raise SyncError(
                f"Google Calendar rejected event {event['id']} (HTTP {status}): {reason}"
            ) from exc

    raise SyncError(f"Gave up creating event {event['id']}.")  # pragma: no cover - unreachable


# --------------------------------------------------------------------------- #
# Watermark state
# --------------------------------------------------------------------------- #

def read_watermark(path: Path) -> int | None:
    """Read the epoch of the newest activity synced so far, or None."""
    if not path.exists():
        LOG.info("No state file at %s — treating this as a first run.", path)
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8") or "{}")
    except json.JSONDecodeError as exc:
        raise SyncError(f"State file {path} is not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise SyncError(f"State file {path} should contain a JSON object.")

    value = data.get("last_activity_start_epoch")
    if value is None:
        LOG.info("State file has no watermark yet — treating this as a first run.")
        return None
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise SyncError(
            f"State file {path} has an invalid last_activity_start_epoch: {value!r}"
        )
    return value


def write_watermark(path: Path, epoch: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "last_activity_start": _iso(epoch),
        "last_activity_start_epoch": epoch,
        "updated_at": _iso(int(datetime.now(timezone.utc).timestamp())),
        "note": STATE_NOTE,
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _iso(epoch: int) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def resolve_after(args: argparse.Namespace, config: Config, watermark: int | None) -> tuple[int, str]:
    """Work out the `after` epoch for this run, and why."""
    if args.since is not None:
        return int(args.since.timestamp()), "--since override"

    now = int(datetime.now(timezone.utc).timestamp())
    if watermark is None:
        return (
            now - config.backfill_days * 86400,
            f"no watermark yet, backfilling {config.backfill_days} days",
        )

    # Query a little before the watermark: an activity recorded on Saturday but
    # uploaded on Monday has a start_date behind the watermark and would
    # otherwise be missed forever. Re-fetching is free — the deterministic event
    # ids mean anything already synced comes back as a 409 duplicate.
    overlap = config.overlap_days * 86400
    return max(watermark - overlap, 0), f"watermark minus {config.overlap_days} days of overlap"


# --------------------------------------------------------------------------- #
# Command line
# --------------------------------------------------------------------------- #

def _since_type(value: str) -> datetime:
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"--since expects YYYY-MM-DD, got {value!r}") from exc
    return parsed.replace(tzinfo=timezone.utc)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy completed Strava activities into a Google Calendar."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="fetch from Strava and print what would be created; write nothing",
    )
    parser.add_argument(
        "--since",
        type=_since_type,
        metavar="YYYY-MM-DD",
        help="ignore the stored watermark and fetch from this date (00:00 UTC) instead",
    )
    parser.add_argument("--verbose", action="store_true", help="log rate-limit detail too")
    return parser.parse_args(argv)


def configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def _activity_start_epoch(activity: dict[str, Any]) -> int:
    return int(_parse_utc(activity["start_date"]).timestamp())


def _print_dry_run(activities: list[dict[str, Any]]) -> None:
    print()
    print(f"--dry-run: {len(activities)} activit{'y' if len(activities) == 1 else 'ies'} "
          f"would be sent to Google Calendar. Nothing was written.")
    for activity in activities:
        try:
            event = to_event(activity)
        except MAPPING_ERRORS as exc:
            print(f"\n  ! activity {activity.get('id')} could not be mapped: {exc}")
            continue
        print()
        print(f"  {event['summary']}")
        print(f"    event id : {event['id']}")
        print(f"    start    : {event['start']['dateTime']} ({event['start'].get('timeZone', 'offset only')})")
        print(f"    end      : {event['end']['dateTime']}")
        for line in event["description"].splitlines():
            print(f"    | {line}" if line else "    |")
    print()


def run(args: argparse.Namespace) -> int:
    config = load_config(need_google=not args.dry_run)

    with requests.Session() as session:
        session.headers["User-Agent"] = "strava-calendar-sync (personal, one-way)"
        access_token = get_access_token(session, config)

        watermark = read_watermark(config.state_path)
        after_epoch, why = resolve_after(args, config, watermark)
        LOG.info("Fetching activities started after %s (%s).", _iso(after_epoch), why)

        activities = fetch_activities(session, access_token, after_epoch)

    # Do not rely on Strava's ordering: sort oldest first so the calendar fills
    # in chronologically and the watermark is easy to reason about. Parsing here
    # rather than in the sort key means one unreadable activity is reported and
    # skipped instead of taking the whole run down.
    dated: list[tuple[int, dict[str, Any]]] = []
    for activity in activities:
        try:
            dated.append((_activity_start_epoch(activity), activity))
        except MAPPING_ERRORS as exc:
            LOG.warning(
                "Skipping activity %s — its start_date could not be read (%s).",
                activity.get("id"), exc,
            )
    dated.sort(key=lambda pair: pair[0])
    activities = [activity for _, activity in dated]
    LOG.info("Fetched %d activit%s from Strava.", len(activities), "y" if len(activities) == 1 else "ies")

    if args.dry_run:
        _print_dry_run(activities)
        return 0

    if not activities:
        LOG.info("Nothing new to sync — the calendar is already up to date.")
        return 0

    calendar_id = config.google_calendar_id
    if not calendar_id:  # guaranteed by load_config(need_google=True); belt and braces
        raise SyncError("GOOGLE_CALENDAR_ID is not set.")
    service = build_calendar_service(config)

    created = duplicates = failed = 0
    for activity in activities:
        try:
            event = to_event(activity)
            outcome = insert_event(service, calendar_id, event)
        except MAPPING_ERRORS as exc:
            failed += 1
            LOG.error("Activity %s could not be synced: %s", activity.get("id"), exc)
            continue

        if outcome == "created":
            created += 1
            LOG.info("Created %s (%s).", event["summary"], event["start"]["dateTime"])
        else:
            duplicates += 1
            LOG.info("Already synced, skipping %s.", event["summary"])

    LOG.info(
        "Done: %d fetched, %d created, %d skipped as duplicates, %d failed.",
        len(activities), created, duplicates, failed,
    )

    if failed:
        LOG.error(
            "Leaving the watermark untouched so the next run retries the failures. "
            "Events already created will come back as duplicates and be skipped."
        )
        return 1

    newest = max(epoch for epoch, _ in dated)
    if watermark is None or newest > watermark:
        write_watermark(config.state_path, newest)
        LOG.info("Watermark advanced to %s.", _iso(newest))
    else:
        LOG.info("Watermark unchanged at %s.", _iso(watermark))
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    configure_logging(args.verbose)
    try:
        return run(args)
    except SyncError as exc:
        LOG.error("%s", exc)
        return 1
    except KeyboardInterrupt:
        LOG.error("Interrupted.")
        return 1
    except Exception:  # noqa: BLE001 - last resort, so the exit status is always meaningful
        LOG.exception("Unexpected failure.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
