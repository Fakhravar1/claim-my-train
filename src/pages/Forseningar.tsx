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
} from "@/content/stationStats";

/**
 * /forseningar — station-statistics hub. Lists every station with enough
 * measured departures in the snapshot (src/content/stationStats.json),
 * worst-first, linking each /forseningar/<slug> page. Prerendered to static
 * HTML at build time.
 */
export default function Forseningar() {
  useDaylightStyles();
  const period = STATIONS[0] ? periodLabel(STATIONS[0]) : "";

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

        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", background: "var(--card-bg)", fontSize: ".93rem" }}>
            <thead>
              <tr>
                {["Station", "Avgångar", "≥ 20 min sena", "Andel ≥ 20 min", "Inställda"].map((h) => (
                  <th key={h} style={{ border: "1px solid var(--line)", padding: ".55rem .7rem", textAlign: "left", fontWeight: 700 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STATIONS_WORST_FIRST.map((s) => (
                <tr key={s.slug}>
                  <td style={{ border: "1px solid var(--line)", padding: ".5rem .7rem" }}>
                    <Link to={stationPath(s)} style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
                      {s.station_name}
                    </Link>
                  </td>
                  <td style={{ border: "1px solid var(--line)", padding: ".5rem .7rem" }}>{s.n_departures}</td>
                  <td style={{ border: "1px solid var(--line)", padding: ".5rem .7rem" }}>{s.n_late_20}</td>
                  <td style={{ border: "1px solid var(--line)", padding: ".5rem .7rem" }}>{pctLate20(s)} %</td>
                  <td style={{ border: "1px solid var(--line)", padding: ".5rem .7rem" }}>{s.n_cancelled}</td>
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
