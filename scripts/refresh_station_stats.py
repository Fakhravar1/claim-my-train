"""Regenerate src/content/stationStats.json — the build-time data snapshot
behind the /forseningar station pages.

Reads the Supabase connection from the local dbt profile (~/.dbt/profiles.yml,
same session-pooler creds dbt uses) and aggregates departure delays per station
from dbt_dev.agg_station_delays_daily (falling back to int_stop_events while
the agg is still empty/new). Stations with fewer than MIN_MEASURED measured
departures in the window are dropped so we never publish thin pages.

Run from the repo root with the dbt venv's python:

    dbt\\.venv\\Scripts\\python.exe scripts\\refresh_station_stats.py

Then rebuild + commit the JSON. The prerender step (scripts/prerenderGuides.ts)
turns each row into a static /forseningar/<slug> page at build time.
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import date
from pathlib import Path

import psycopg2
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "src" / "content" / "stationStats.json"

# Prefer the accumulating agg (grows past the int prune); cap the window at 30
# full days. While the agg holds fewer days than int_stop_events (it was added
# later), the union below still yields the widest window available.
WINDOW_DAYS = 30
MIN_MEASURED = 50  # departures with a realtime signal — below this the page is too thin

SQL = f"""
with base as (
    select station_id, station_name, service_date,
           n_departures, n_measured, n_late_5, n_late_20, n_cancelled,
           sum_delay_seconds, max_delay_seconds
    from dbt_dev.agg_station_delays_daily
    where service_date >= current_date - interval '{WINDOW_DAYS} days'
      and service_date < current_date

    union all

    -- fallback for days not yet in the agg (it accumulates going forward)
    select station_id, station_name, service_date,
           count(*),
           count(delay_seconds),
           count(*) filter (where delay_seconds >= 300),
           count(*) filter (where delay_seconds >= 1200),
           count(*) filter (where canceled),
           sum(greatest(delay_seconds, 0)),
           max(delay_seconds)
    from dbt_dev.int_stop_events
    where event_type = 'departure'
      and service_date >= current_date - interval '{WINDOW_DAYS} days'
      and service_date < current_date
      and service_date not in (
          select distinct service_date from dbt_dev.agg_station_delays_daily
      )
    group by station_id, station_name, service_date
),

operators as (
    -- dominant brand label per station, for the page copy
    select distinct on (station_id)
           station_id,
           coalesce(operator, train_owner) as operator_label
    from dbt_dev.int_stop_events
    where event_type = 'departure'
      and coalesce(operator, train_owner) is not null
      and service_date >= current_date - interval '{WINDOW_DAYS} days'
    group by station_id, coalesce(operator, train_owner)
    order by station_id, count(*) desc
)

select b.station_id,
       max(b.station_name)                        as station_name,
       min(b.service_date)::text                  as from_date,
       max(b.service_date)::text                  as to_date,
       sum(b.n_departures)::int                   as n_departures,
       sum(b.n_measured)::int                     as n_measured,
       sum(b.n_late_5)::int                       as n_late_5,
       sum(b.n_late_20)::int                      as n_late_20,
       sum(b.n_cancelled)::int                    as n_cancelled,
       coalesce(round(sum(b.sum_delay_seconds)::numeric
                      / nullif(sum(b.n_measured), 0))::int, 0) as avg_delay_seconds,
       coalesce(max(b.max_delay_seconds), 0)::int as max_delay_seconds,
       max(o.operator_label)                      as operator_label
from base b
left join operators o using (station_id)
group by b.station_id
having sum(b.n_measured) >= {MIN_MEASURED}
order by station_name
"""


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = s.replace("å", "a").replace("ä", "a").replace("ö", "o").replace("ø", "o").replace("æ", "ae")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def load_dbt_conn() -> dict:
    profiles = yaml.safe_load((Path.home() / ".dbt" / "profiles.yml").read_text(encoding="utf-8"))
    # first profile's first target — this repo has a single dbt project
    for profile in profiles.values():
        if not isinstance(profile, dict) or "outputs" not in profile:
            continue
        target = profile["outputs"][profile["target"]]
        return dict(
            host=target["host"], port=target.get("port", 5432), user=target["user"],
            # dbt-postgres accepts either `pass` or `password` in profiles.yml
            password=target.get("password") or target.get("pass"),
            dbname=target.get("dbname") or target.get("database"),
        )
    raise SystemExit("No usable dbt profile found in ~/.dbt/profiles.yml")


def main() -> None:
    conn = psycopg2.connect(**load_dbt_conn())
    try:
        with conn.cursor() as cur:
            cur.execute(SQL)
            cols = [d[0] for d in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    finally:
        conn.close()

    slugs: dict[str, str] = {}
    stations = []
    for r in rows:
        slug = slugify(r["station_name"])
        if slug in slugs:  # name collision — disambiguate with the stable station_id
            slug = f"{slug}-{r['station_id']}"
        slugs[slug] = r["station_id"]
        stations.append({"slug": slug, **r})

    payload = {
        "generated": date.today().isoformat(),
        "stations": stations,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    # ASCII-only: the Windows console is cp1252 and chokes on em-dash/arrow
    print(f"wrote {OUT_PATH}: {len(stations)} stations, window "
          f"{min(s['from_date'] for s in stations)} to {max(s['to_date'] for s in stations)}")


if __name__ == "__main__":
    main()
