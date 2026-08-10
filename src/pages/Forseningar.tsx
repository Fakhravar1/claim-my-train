import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { Nav, Footer } from "@/components/daylight/shell";
import {
  STATIONS_WORST_FIRST,
  STATIONS,
  stationPath,
  pctLate20,
  periodLabel,
  type StationStat,
} from "@/content/stationStats";
import { OPERATORS_WORST_FIRST, operatorPath } from "@/content/operatorStats";

type SortKey = "station" | "departures" | "late20" | "pct" | "cancelled";
type SortDir = "asc" | "desc";

const COLS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "station", label: "Station", align: "left" },
  { key: "departures", label: "Avgångar", align: "right" },
  { key: "late20", label: "≥ 20 min sena", align: "right" },
  { key: "pct", label: "Andel ≥ 20 min", align: "right" },
  { key: "cancelled", label: "Inställda", align: "right" },
];

function sortValue(s: StationStat, key: SortKey): number | string {
  switch (key) {
    case "station": return s.station_name.toLocaleLowerCase("sv");
    case "departures": return s.n_departures;
    case "late20": return s.n_late_20;
    case "pct": return s.n_departures > 0 ? s.n_late_20 / s.n_departures : 0;
    case "cancelled": return s.n_cancelled;
  }
}

export default function Forseningar() {
  useDaylightStyles();
  const period = STATIONS[0] ? periodLabel(STATIONS[0]) : "";
  const [sortKey, setSortKey] = useState<SortKey>("late20");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const arr = [...STATIONS_WORST_FIRST];
    arr.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "sv");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // sensible default: text asc, numeric desc
      setSortDir(key === "station" ? "asc" : "desc");
    }
  };


  return (
    <div className="cmt-daylight">
      <Helmet>
        <title>Tågförseningar i Sverige — statistik per station | Qvitta</title>
        <meta
          name="description"
          content={`Hur ofta är tågen försenade från din station? Statistik för ${STATIONS.length} svenska stationer baserad på Trafikverkets realtidsdata — och hur du får ersättning.`}
        />
        <link rel="canonical" href="https://qvitta.nu/forseningar" />
      </Helmet>

      <Nav signedIn={false} accountLabel="" onSignOut={() => {}} onLogin={() => {}} />

      <main className="wrap" style={{ paddingTop: "2.5rem", paddingBottom: "4rem", maxWidth: 820 }}>
        <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 .5rem", lineHeight: 1.15 }}>
          Tågförseningar i Sverige — statistik per station
        </h1>
        <p className="lead" style={{ margin: "0 0 .8rem", fontSize: "1.05rem", color: "var(--ink-2)", lineHeight: 1.55 }}>
          Vi mäter varje avgång från {STATIONS.length} stationer med Trafikverkets realtidsdata.
          Här ser du hur ofta tågen faktiskt är sena från din station — och en försening på 20
          minuter ger ofta <Link to="/ersattning" style={{ color: "var(--accent)" }}>rätt till ersättning</Link>.
        </p>
        <p style={{ margin: "0 0 1.8rem", fontSize: ".85rem", color: "var(--muted)" }}>
          Period: {period}. Stationerna är sorterade efter antal ersättningsgrundande förseningar (≥ 20 min).
        </p>

        {OPERATORS_WORST_FIRST.length > 0 && (
          <>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 .6rem" }}>
              Förseningar per tågbolag
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", marginBottom: "1.8rem" }}>
              {OPERATORS_WORST_FIRST.map((o) => (
                <Link key={o.slug} to={operatorPath(o)} className="btn" style={{ fontSize: ".92rem" }}>
                  {o.name}
                </Link>
              ))}
            </div>
          </>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", background: "var(--card-bg)", fontSize: ".93rem" }}>
            <thead>
              <tr>
                {COLS.map((c) => {
                  const active = c.key === sortKey;
                  const arrow = active ? (sortDir === "asc" ? "▲" : "▼") : "";
                  return (
                    <th
                      key={c.key}
                      onClick={() => onSort(c.key)}
                      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                      style={{
                        border: "1px solid var(--line)",
                        padding: ".55rem .7rem",
                        textAlign: c.align,
                        fontWeight: 700,
                        cursor: "pointer",
                        userSelect: "none",
                        background: active ? "var(--surface-2, rgba(0,0,0,.03))" : undefined,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.label}{arrow ? ` ${arrow}` : ""}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.slug}>
                  <td style={{ border: "1px solid var(--line)", padding: ".5rem .7rem" }}>
                    <Link to={stationPath(s)} style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                      {s.station_name}
                    </Link>
                  </td>
                  <td style={{ border: "1px solid var(--line)", padding: ".5rem .7rem", textAlign: "right" }}>{s.n_departures}</td>
                  <td style={{ border: "1px solid var(--line)", padding: ".5rem .7rem", textAlign: "right" }}>{s.n_late_20}</td>
                  <td style={{ border: "1px solid var(--line)", padding: ".5rem .7rem", textAlign: "right" }}>{pctLate20(s)} %</td>
                  <td style={{ border: "1px solid var(--line)", padding: ".5rem .7rem", textAlign: "right" }}>{s.n_cancelled}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>


        <p style={{ marginTop: "1.5rem", fontSize: ".9rem", color: "var(--muted)", lineHeight: 1.6 }}>
          Statistiken bygger på uppmätta avgångar (tåg med realtidssignal) och uppdateras månadsvis.
          En avgång räknas som försenad från 5 minuter och som ersättningsgrundande från 20 minuter
          — vilken ersättning just din resa ger beror på operatören, se{" "}
          <Link to="/ersattning" style={{ color: "var(--accent)" }}>ersättningsguiden</Link>.
        </p>
      </main>

      <Footer />
    </div>
  );
}
