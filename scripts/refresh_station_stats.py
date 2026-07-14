"""Regenerate src/content/stationStats.json AND src/content/operatorStats.json
— the build-time data snapshots behind the /forseningar station pages and the
/forseningar/tag/<operator> pages.

Reads the Supabase connection from the local dbt profile (~/.dbt/profiles.yml,
same session-pooler creds dbt uses) and aggregates departure delays per station
from dbt_dev.agg_station_delays_daily plus per-train delays per operator label
from dbt_dev.agg_operator_delays_daily (each falling back to int_stop_events
for days the agg doesn't hold yet). Stations with fewer than MIN_MEASURED
measured departures in the window are dropped so we never publish thin pages.

The operator snapshot stays at RAW-label day grain ('Ö-TÅG', 'SKANE',
'Mälardalstrafik AB', ...): the brand merge (which labels are one operator,
and which get a page) lives in src/content/operatorStats.ts next to the
display mapping it must agree with.

Run from the repo root with the dbt venv's python:

    dbt\\.venv\\Scripts\\python.exe scripts\\refresh_station_stats.py

Then rebuild + commit the JSON. The prerender step (scripts/prerenderGuides.ts)
turns each row into a static page at build time.
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
OUT_PATH_OPERATORS = REPO_ROOT / "src" / "content" / "operatorStats.json"

# Prefer the accumulating agg (grows past the int prune); cap the window at 30
# full days. While the agg holds fewer days than int_stop_events (it was added
# later), the union below still yields the widest window available.
WINDOW_DAYS = 30
MIN_MEASURED = 50  # departures with a realtime signal — below this the page is too thin
DAY_ROWS = 7  # per-day rows published per station ("Senaste dagarna" table)

# Day-grain rows; period totals AND the per-day tail are aggregated in Python
# from this one result set (keeps the agg/int fallback union in one place).
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
)

select station_id,
       max(station_name)                          as station_name,
       service_date::text                         as service_date,
       sum(n_departures)::int                     as n_departures,
       sum(n_measured)::int                       as n_measured,
       sum(n_late_5)::int                         as n_late_5,
       sum(n_late_20)::int                        as n_late_20,
       sum(n_cancelled)::int                      as n_cancelled,
       coalesce(sum(sum_delay_seconds), 0)::bigint as sum_delay_seconds,
       coalesce(max(max_delay_seconds), 0)::int   as max_delay_seconds
from base
group by station_id, service_date
order by station_id, service_date
"""

# Operator day-grain rows for operatorStats.json. Same agg-plus-int-fallback
# union as SQL above, but at (raw operator label, service_date) TRAIN grain —
# the fallback replicates agg_operator_delays_daily's logic: a train's label is
# the mode() of coalesce(operator, train_owner) over its stop events, its delay
# the max over measured stops.
SQL_OPERATOR_DAYS = f"""
with base as (
    select operator_label, service_date,
           n_trains, n_measured, n_late_5, n_late_20, n_cancelled,
           sum_delay_seconds, max_delay_seconds
    from dbt_dev.agg_operator_delays_daily
    where service_date >= current_date - interval '{WINDOW_DAYS} days'
      and service_date < current_date

    union all

    select t.operator_label, t.service_date,
           count(*),
           count(*) filter (where t.is_measured),
           count(*) filter (where t.max_delay_seconds >= 300),
           count(*) filter (where t.max_delay_seconds >= 1200),
           count(*) filter (where t.canceled),
           sum(greatest(t.max_delay_seconds, 0)) filter (where t.is_measured),
           max(t.max_delay_seconds)
    from (
        select service_number, service_date,
               mode() within group (order by coalesce(operator, train_owner)) as operator_label,
               max(delay_seconds)                 as max_delay_seconds,
               count(delay_seconds) > 0           as is_measured,
               bool_or(coalesce(canceled, false)) as canceled
        from dbt_dev.int_stop_events
        where service_date >= current_date - interval '{WINDOW_DAYS} days'
          and service_date < current_date
          and service_date not in (
              select distinct service_date from dbt_dev.agg_operator_delays_daily
          )
        group by service_number, service_date
    ) t
    where t.operator_label is not null
    group by t.operator_label, t.service_date
)

select operator_label,
       service_date::text                          as service_date,
       n_trains::int                               as n_trains,
       n_measured::int                             as n_measured,
       n_late_5::int                               as n_late_5,
       n_late_20::int                              as n_late_20,
       n_cancelled::int                            as n_cancelled,
       coalesce(sum_delay_seconds, 0)::bigint      as sum_delay_seconds,
       coalesce(max_delay_seconds, 0)::int         as max_delay_seconds
from base
order by operator_label, service_date
"""

SQL_OPERATORS = f"""
select distinct on (station_id)
       station_id,
       coalesce(operator, train_owner) as operator_label
from dbt_dev.int_stop_events
where event_type = 'departure'
  and coalesce(operator, train_owner) is not null
  and service_date >= current_date - interval '{WINDOW_DAYS} days'
group by station_id, coalesce(operator, train_owner)
order by station_id, count(*) desc
"""


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = s.replace("å", "a").replace("ä", "a").replace("ö", "o").replace("ø", "o").replace("æ", "ae")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def load_dbt_conn() -> dict:
    # CI path: the dbt session-pooler secrets exposed as env vars
    # (same SUPABASE_DB_* set the dbt-run workflow uses).
    import os
    if os.environ.get("SUPABASE_DB_HOST"):
        return dict(
            host=os.environ["SUPABASE_DB_HOST"],
            port=int(os.environ.get("SUPABASE_DB_PORT", "5432")),
            user=os.environ["SUPABASE_DB_USER"],
            password=os.environ["SUPABASE_DB_PASSWORD"],
            dbname=os.environ.get("SUPABASE_DB_NAME", "postgres"),
        )
    # Local path: read the dbt profile.
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
            day_rows = [dict(zip(cols, r)) for r in cur.fetchall()]
            cur.execute(SQL_OPERATORS)
            operator_label = {sid: label for sid, label in cur.fetchall()}
            cur.execute(SQL_OPERATOR_DAYS)
            op_cols = [d[0] for d in cur.description]
            operator_days = [dict(zip(op_cols, r)) for r in cur.fetchall()]
    finally:
        conn.close()

    # Aggregate the day-grain rows per station: period totals over the whole
    # window + the last DAY_ROWS days for the "Senaste dagarna" table.
    by_station: dict[str, list[dict]] = {}
    for r in day_rows:
        by_station.setdefault(r["station_id"], []).append(r)

    rows = []
    for sid, days in by_station.items():
        days.sort(key=lambda d: d["service_date"])  # SQL orders too; belt and braces
        n_measured = sum(d["n_measured"] for d in days)
        if n_measured < MIN_MEASURED:
            continue
        sum_delay = sum(d["sum_delay_seconds"] for d in days)
        rows.append({
            "station_id": sid,
            "station_name": days[-1]["station_name"],
            "from_date": days[0]["service_date"],
            "to_date": days[-1]["service_date"],
            "n_departures": sum(d["n_departures"] for d in days),
            "n_measured": n_measured,
            "n_late_5": sum(d["n_late_5"] for d in days),
            "n_late_20": sum(d["n_late_20"] for d in days),
            "n_cancelled": sum(d["n_cancelled"] for d in days),
            "avg_delay_seconds": round(sum_delay / n_measured) if n_measured else 0,
            "max_delay_seconds": max(d["max_delay_seconds"] for d in days),
            "operator_label": operator_label.get(sid),
            # latest day first; compact keys — this array ships in the JS bundle
            "days": [
                {
                    "d": d["service_date"],
                    "dep": d["n_departures"],
                    "l20": d["n_late_20"],
                    "canc": d["n_cancelled"],
                    "mx": d["max_delay_seconds"],
                }
                for d in reversed(days[-DAY_ROWS:])
            ],
        })
    rows.sort(key=lambda r: r["station_name"])

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

    # Operator snapshot: raw-label day grain, compact keys (ships in the JS
    # bundle); brand merge + page selection happen in src/content/operatorStats.ts.
    op_payload = {
        "generated": date.today().isoformat(),
        "rows": [
            {
                "label": r["operator_label"],
                "d": r["service_date"],
                "tr": r["n_trains"],
                "ms": r["n_measured"],
                "l5": r["n_late_5"],
                "l20": r["n_late_20"],
                "canc": r["n_cancelled"],
                "sd": r["sum_delay_seconds"],
                "mx": r["max_delay_seconds"],
            }
            for r in operator_days
        ],
    }
    OUT_PATH_OPERATORS.write_text(json.dumps(op_payload, ensure_ascii=False, indent=1), encoding="utf-8")

    # ASCII-only: the Windows console is cp1252 and chokes on em-dash/arrow
    print(f"wrote {OUT_PATH}: {len(stations)} stations, window "
          f"{min(s['from_date'] for s in stations)} to {max(s['to_date'] for s in stations)}")
    print(f"wrote {OUT_PATH_OPERATORS}: {len(op_payload['rows'])} operator-day rows")


if __name__ == "__main__":
    main()
