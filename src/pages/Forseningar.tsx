import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { Nav, Footer } from "@/components/daylight/shell";
import {
  STATIONS,
  type StationStat,
  stationPath,
  pctLate20,
  periodLabel,
  dayLabel,
  minutes,
} from "@/content/stationStats";

type SortKey = "l20" | "share" | "canc" | "dep" | "name";

/** One display row — period totals or a single day's numbers per station. */
type Row = {
  s: StationStat;
  dep: number;
  l20: number;
  canc: number;
  /** Period mode only (per-day rows have no measured count). */
  share: string | null;
  /** Day mode only. */
  mx: number | null;
};

const shareOf = (s: StationStat) => (s.n_measured > 0 ? s.n_late_20 / s.n_measured : 0);

const cell: React.CSSProperties = {
  border: "1px solid var(--line)",
  padding: ".5rem .7rem",
};

const selectStyle: React.CSSProperties = {
  padding: ".45rem .6rem",
  border: "1px solid var(--line)",
  borderRadius: ".5rem",
  background: "var(--card-bg)",
  color: "inherit",
  font: "inherit",
  fontSize: ".9rem",
};

/**
 * /forseningar — station-statistics hub. Lists every station with enough
 * measured departures in the snapshot (src/content/stationStats.json), with
 * client-side sorting and a per-day filter (from the days arrays, when the
 * snapshot carries them). The prerendered static version stays the plain
 * worst-first table — crawlers need the links, not the widgets.
 */
export default function Forseningar() {
  useDaylightStyles();
  const period = STATIONS[0] ? periodLabel(STATIONS[0]) : "";

  const [sortKey, setSortKey] = useState<SortKey>("l20");
  const [day, setDay] = useState<string>(""); // "" = whole period

  // Union of dates present in any station's per-day rows, latest first.
  const availableDays = useMemo(() => {
    const set = new Set<string>();
    for (const s of STATIONS) for (const d of s.days ?? []) set.add(d.d);
    return [...set].sort().reverse();
  }, []);

  const rows = useMemo(() => {
    let list: Row[];
    if (day) {
      list = STATIONS.flatMap((s) => {
        const d = s.days?.find((x) => x.d === day);
        return d ? [{ s, dep: d.dep, l20: d.l20, canc: d.canc, share: null, mx: d.mx }] : [];
      });
    } else {
      list = STATIONS.map((s) => ({
        s,
        dep: s.n_departures,
        l20: s.n_late_20,
        canc: s.n_cancelled,
        share: pctLate20(s),
        mx: null,
      }));
    }
    list.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.s.station_name.localeCompare(b.s.station_name, "sv");
        case "dep":
          return b.dep - a.dep || b.l20 - a.l20;
        case "canc":
          return b.canc - a.canc || b.l20 - a.l20;
        case "share":
          return shareOf(b.s) - shareOf(a.s) || b.l20 - a.l20;
        default:
          return b.l20 - a.l20 || b.dep - a.dep;
      }
    });
    return list;
  }, [day, sortKey]);

  const headers = day
    ? ["Station", "Avgångar", "≥ 20 min sena", "Inställda", "Största försening"]
    : ["Station", "Avgångar", "≥ 20 min sena", "Andel ≥ 20 min", "Inställda"];

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
        <p style={{ margin: "0 0 1.4rem", fontSize: ".85rem", color: "var(--muted)" }}>
          {day ? `Visar ${dayLabel(day)}.` : `Period: ${period}.`}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: ".8rem 1.4rem", alignItems: "center", margin: "0 0 1.2rem" }}>
          <label style={{ fontSize: ".9rem", color: "var(--ink-2)", display: "flex", alignItems: "center", gap: ".5rem" }}>
            Sortera efter
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={selectStyle}>
              <option value="l20">Flest förseningar ≥ 20 min</option>
              {!day && <option value="share">Högst andel ≥ 20 min</option>}
              <option value="canc">Flest inställda</option>
              <option value="dep">Flest avgångar</option>
              <option value="name">Station A–Ö</option>
            </select>
          </label>
          {availableDays.length > 0 && (
            <label style={{ fontSize: ".9rem", color: "var(--ink-2)", display: "flex", alignItems: "center", gap: ".5rem" }}>
              Dag
              <select
                value={day}
                onChange={(e) => {
                  const next = e.target.value;
                  setDay(next);
                  if (next && sortKey === "share") setSortKey("l20");
                }}
                style={selectStyle}
              >
                <option value="">Hela perioden</option>
                {availableDays.map((d) => (
                  <option key={d} value={d}>{dayLabel(d)}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", background: "var(--card-bg)", fontSize: ".93rem" }}>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h} style={{ ...cell, padding: ".55rem .7rem", fontWeight: 700, textAlign: "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.s.slug}>
                  <td style={cell}>
                    <Link to={stationPath(r.s)} style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                      {r.s.station_name}
                    </Link>
                  </td>
                  <td style={cell}>{r.dep}</td>
                  <td style={cell}>{r.l20}</td>
                  {day ? (
                    <>
                      <td style={cell}>{r.canc}</td>
                      <td style={cell}>{minutes(r.mx ?? 0)} min</td>
                    </>
                  ) : (
                    <>
                      <td style={cell}>{r.share} %</td>
                      <td style={cell}>{r.canc}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: "1.5rem", fontSize: ".9rem", color: "var(--muted)", lineHeight: 1.6 }}>
          Statistiken bygger på uppmätta avgångar (tåg med realtidssignal) och uppdateras löpande.
          En avgång räknas som försenad från 5 minuter och som ersättningsgrundande från 20 minuter
          — vilken ersättning just din resa ger beror på operatören, se{" "}
          <Link to="/ersattning" style={{ color: "var(--accent)" }}>ersättningsguiden</Link>.
        </p>
      </main>

      <Footer />
    </div>
  );
}
