import { Helmet } from "react-helmet-async";
import { Link, Navigate, useParams } from "react-router-dom";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { Nav, Footer } from "@/components/daylight/shell";
import {
  stationBySlug,
  stationPath,
  stationUrl,
  stationLiveHref,
  STATIONS_WORST_FIRST,
  pctOnTime,
  pctLate5,
  pctLate20,
  minutes,
  periodLabel,
  dayLabel,
  operatorDisplay,
  operatorGuideSlug,
} from "@/content/stationStats";

const cell: React.CSSProperties = {
  border: "1px solid var(--line)",
  padding: ".6rem .8rem",
  textAlign: "left",
  fontSize: ".95rem",
};

/**
 * /forseningar/:slug — per-station delay statistics + ersättning CTA.
 * Data is the committed snapshot in src/content/stationStats.json; the page is
 * prerendered to static HTML at build time (scripts/prerenderGuides.ts).
 */
export default function ForseningarStation() {
  useDaylightStyles();
  const { slug } = useParams<{ slug: string }>();
  const s = slug ? stationBySlug(slug) : undefined;

  if (!s) return <Navigate to="/forseningar" replace />;

  const operator = operatorDisplay(s.operator_label);
  const guideSlug = operatorGuideSlug(s);
  const period = periodLabel(s);
  const top = STATIONS_WORST_FIRST.slice(0, 10).filter((x) => x.slug !== s.slug).slice(0, 8);

  return (
    <div className="cmt-daylight">
      <Helmet>
        <title>{`Tågförseningar ${s.station_name} — statistik & ersättning | Qvitta`}</title>
        <meta
          name="description"
          content={`${period}: ${s.n_departures} avgångar från ${s.station_name}, ${s.n_late_20} minst 20 minuter försenade och ${s.n_cancelled} inställda. Se statistiken och ansök om ersättning.`}
        />
        <link rel="canonical" href={stationUrl(s)} />
      </Helmet>

      <Nav signedIn={false} accountLabel="" onSignOut={() => {}} onLogin={() => {}} />

      <main className="wrap" style={{ paddingTop: "2.5rem", paddingBottom: "4rem", maxWidth: 760 }}>
        <nav aria-label="Brödsmulor" style={{ fontSize: ".88rem", color: "var(--muted)", marginBottom: "1rem" }}>
          <Link to="/forseningar" style={{ color: "var(--accent)", textDecoration: "none" }}>
            Tågförseningar
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{s.station_name}</span>
        </nav>

        <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 .5rem", lineHeight: 1.15 }}>
          Tågförseningar {s.station_name}
        </h1>
        <p className="lead" style={{ margin: "0 0 1.2rem", fontSize: "1.05rem", color: "var(--ink-2)", lineHeight: 1.55 }}>
          Under perioden {period} avgick {s.n_departures} tåg från {s.station_name}
          {operator ? ` (främst ${operator})` : ""}. {pctOnTime(s)} % gick i tid, {s.n_late_20} avgångar
          var minst 20 minuter försenade och {s.n_cancelled} ställdes in.
        </p>

        <div style={{ margin: "0 0 1.6rem" }}>
          <Link to={stationLiveHref(s)} className="btn btn--accent">
            Se dagens avgångar från {s.station_name} — live
          </Link>
        </div>

        {s.days && s.days.length > 0 && (
          <>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0 0 .7rem" }}>
              Senaste dagarna
            </h2>
            <div style={{ overflowX: "auto", margin: "0 0 1.6rem" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", background: "var(--card-bg)" }}>
                <thead>
                  <tr>
                    <th style={{ ...cell, fontWeight: 700 }}>Dag</th>
                    <th style={{ ...cell, fontWeight: 700 }}>Avgångar</th>
                    <th style={{ ...cell, fontWeight: 700 }}>≥ 20 min sena</th>
                    <th style={{ ...cell, fontWeight: 700 }}>Inställda</th>
                    <th style={{ ...cell, fontWeight: 700 }}>Största försening</th>
                  </tr>
                </thead>
                <tbody>
                  {s.days.map((d) => (
                    <tr key={d.d}>
                      <td style={cell}>{dayLabel(d.d)}</td>
                      <td style={cell}>{d.dep}</td>
                      <td style={cell}>{d.l20}</td>
                      <td style={cell}>{d.canc}</td>
                      <td style={cell}>{minutes(d.mx)} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0 0 .7rem" }}>
          Hela perioden
        </h2>
        <div style={{ overflowX: "auto", margin: "0 0 1.2rem" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", background: "var(--card-bg)" }}>
            <tbody>
              <tr><td style={cell}>Avgångar under perioden</td><td style={cell}>{s.n_departures}</td></tr>
              <tr><td style={cell}>I tid (mindre än 5 min sena)</td><td style={cell}>{pctOnTime(s)} %</td></tr>
              <tr><td style={cell}>Försenade ≥ 5 minuter</td><td style={cell}>{s.n_late_5} ({pctLate5(s)} %)</td></tr>
              <tr><td style={cell}>Försenade ≥ 20 minuter (kan ge ersättning)</td><td style={cell}>{s.n_late_20} ({pctLate20(s)} %)</td></tr>
              <tr><td style={cell}>Inställda avgångar</td><td style={cell}>{s.n_cancelled}</td></tr>
              <tr><td style={cell}>Genomsnittlig försening</td><td style={cell}>{minutes(s.avg_delay_seconds)} min</td></tr>
              <tr><td style={cell}>Största försening</td><td style={cell}>{minutes(s.max_delay_seconds)} min</td></tr>
            </tbody>
          </table>
        </div>

        <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "1.8rem 0 .7rem" }}>
          Försenad från {s.station_name}? Så får du ersättning
        </h2>
        <p style={{ margin: "0 0 1rem", color: "var(--ink-2)", lineHeight: 1.65, fontSize: ".98rem" }}>
          En försening på 20 minuter ger i de flesta fall rätt till 50 % av biljettpriset tillbaka
          — 100 % vid en timme. Sök din avgång på Qvitta så ser du direkt om den ger rätt till
          ersättning, och vi hjälper dig skicka in ansökan.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", marginBottom: "1.6rem" }}>
          <Link to={stationLiveHref(s)} className="btn btn--accent">Hitta din försening</Link>
          <Link to="/ersattning" className="btn">Så funkar ersättningen</Link>
          {guideSlug && operator && (
            <Link to={`/ersattning/${guideSlug}`} className="btn">
              Guide: {operator}
            </Link>
          )}
        </div>

        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "1.6rem 0 .7rem" }}>
          Mest försenade stationerna just nu
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
          {top.map((x) => (
            <Link key={x.slug} to={stationPath(x)} className="btn" style={{ fontSize: ".92rem" }}>
              {x.station_name}
            </Link>
          ))}
          <Link to="/forseningar" className="btn" style={{ fontSize: ".92rem" }}>
            Alla stationer →
          </Link>
        </div>

        <p style={{ marginTop: "1.6rem", fontSize: ".85rem", color: "var(--muted)", lineHeight: 1.6 }}>
          Statistiken bygger på Trafikverkets realtidsdata för uppmätta avgångar (tåg med
          realtidssignal) och uppdateras löpande. Period: {period}.
        </p>
      </main>

      <Footer />
    </div>
  );
}
