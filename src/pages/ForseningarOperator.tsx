import { Helmet } from "react-helmet-async";
import { Link, Navigate, useParams } from "react-router-dom";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { Nav, Footer } from "@/components/daylight/shell";
import {
  OPERATORS_WORST_FIRST,
  operatorBySlug,
  operatorPath,
  operatorUrl,
} from "@/content/operatorStats";
import {
  STATIONS,
  stationPath,
  pctOnTime,
  pctLate5,
  pctLate20,
  minutes,
  periodLabel,
  dayLabel,
  operatorGuideSlug,
} from "@/content/stationStats";

const cell: React.CSSProperties = {
  border: "1px solid var(--line)",
  padding: ".6rem .8rem",
  textAlign: "left",
  fontSize: ".95rem",
};

/**
 * /forseningar/tag/:slug — per-operator delay statistics + ersättning CTA.
 * Targets the status-intent queries ("sj förseningar", "försenat tåg sj") that
 * the /ersattning guides (ersättning intent) don't serve. Data is the committed
 * snapshot in src/content/operatorStats.json (TRAIN grain — see operatorStats.ts);
 * the page is prerendered to static HTML at build time (scripts/prerenderGuides.ts).
 */
export default function ForseningarOperator() {
  useDaylightStyles();
  const { slug } = useParams<{ slug: string }>();
  const o = slug ? operatorBySlug(slug) : undefined;

  if (!o) return <Navigate to="/forseningar" replace />;

  const period = periodLabel(o);
  const worstStations = STATIONS.filter((s) => operatorGuideSlug(s) === o.slug)
    .sort((a, b) => b.n_late_20 - a.n_late_20)
    .slice(0, 8);
  const others = OPERATORS_WORST_FIRST.filter((x) => x.slug !== o.slug).slice(0, 8);

  return (
    <div className="cmt-daylight">
      <Helmet>
        <title>{`${o.name} förseningar — statistik & ersättning | Qvitta`}</title>
        <meta
          name="description"
          content={`Hur försenade är ${o.name}s tåg? ${period}: ${o.n_late_20} av ${o.n_measured} uppmätta tåg var minst 20 minuter sena och ${o.n_cancelled} ställdes in. Se statistiken och ansök om ersättning gratis.`}
        />
        <link rel="canonical" href={operatorUrl(o)} />
      </Helmet>

      <Nav signedIn={false} accountLabel="" onSignOut={() => {}} onLogin={() => {}} />

      <main className="wrap" style={{ paddingTop: "2.5rem", paddingBottom: "4rem", maxWidth: 760 }}>
        <nav aria-label="Brödsmulor" style={{ fontSize: ".88rem", color: "var(--muted)", marginBottom: "1rem" }}>
          <Link to="/forseningar" style={{ color: "var(--accent)", textDecoration: "none" }}>
            Tågförseningar
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{o.name}</span>
        </nav>

        <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 .5rem", lineHeight: 1.15 }}>
          {o.name} förseningar — så sena är tågen
        </h1>
        <p className="lead" style={{ margin: "0 0 1.2rem", fontSize: "1.05rem", color: "var(--ink-2)", lineHeight: 1.55 }}>
          Under perioden {period} körde {o.name} {o.n_trains} tåg i vår mätning.{" "}
          {pctOnTime(o)} % gick i tid hela vägen, {o.n_late_20} tåg var minst 20 minuter
          försenade någonstans längs rutten och {o.n_cancelled} ställdes in.
        </p>

        <div style={{ margin: "0 0 1.6rem" }}>
          <Link to="/#board" className="btn btn--accent">
            Se dagens avgångar live
          </Link>
        </div>

        {o.days.length > 0 && (
          <>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0 0 .7rem" }}>
              Dag för dag i {period}
            </h2>
            <div style={{ overflowX: "auto", margin: "0 0 1.6rem" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", background: "var(--card-bg)" }}>
                <thead>
                  <tr>
                    <th style={{ ...cell, fontWeight: 700 }}>Dag</th>
                    <th style={{ ...cell, fontWeight: 700 }}>Tåg</th>
                    <th style={{ ...cell, fontWeight: 700 }}>≥ 20 min sena</th>
                    <th style={{ ...cell, fontWeight: 700 }}>Inställda</th>
                    <th style={{ ...cell, fontWeight: 700 }}>Största försening</th>
                  </tr>
                </thead>
                <tbody>
                  {o.days.map((d) => (
                    <tr key={d.d}>
                      <td style={cell}>{dayLabel(d.d)}</td>
                      <td style={cell}>{d.tr}</td>
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
              <tr><td style={cell}>Tåg under perioden</td><td style={cell}>{o.n_trains}</td></tr>
              <tr><td style={cell}>I tid (aldrig mer än 5 min sena)</td><td style={cell}>{pctOnTime(o)} %</td></tr>
              <tr><td style={cell}>Försenade ≥ 5 minuter</td><td style={cell}>{o.n_late_5} ({pctLate5(o)} %)</td></tr>
              <tr><td style={cell}>Försenade ≥ 20 minuter (kan ge ersättning)</td><td style={cell}>{o.n_late_20} ({pctLate20(o)} %)</td></tr>
              <tr><td style={cell}>Inställda tåg</td><td style={cell}>{o.n_cancelled}</td></tr>
              <tr><td style={cell}>Genomsnittlig försening per uppmätt tåg</td><td style={cell}>{minutes(o.avg_delay_seconds)} min</td></tr>
              <tr><td style={cell}>Största försening</td><td style={cell}>{minutes(o.max_delay_seconds)} min</td></tr>
            </tbody>
          </table>
        </div>

        <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "1.8rem 0 .7rem" }}>
          Försenad med {o.name}? Så får du ersättning
        </h2>
        <p style={{ margin: "0 0 1rem", color: "var(--ink-2)", lineHeight: 1.65, fontSize: ".98rem" }}>
          En försening på 20 minuter ger i de flesta fall rätt till 50 % av biljettpriset tillbaka
          — 100 % vid en timme. Sök din avgång på Qvitta så ser du direkt om den ger rätt till
          ersättning, och vi hjälper dig skicka in ansökan. Helt gratis — ingen provision, hela
          ersättningen går till dig.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", marginBottom: "1.6rem" }}>
          <Link to="/#board" className="btn btn--accent">Hitta din försening</Link>
          <Link to={`/ersattning/${o.slug}`} className="btn">
            Guide: ersättning hos {o.name}
          </Link>
          <Link to="/ersattning" className="btn">Så funkar ersättningen</Link>
        </div>

        {worstStations.length > 0 && (
          <>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "1.6rem 0 .7rem" }}>
              Mest försenade stationerna där {o.name} dominerar
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", marginBottom: "1.2rem" }}>
              {worstStations.map((s) => (
                <Link key={s.slug} to={stationPath(s)} className="btn" style={{ fontSize: ".92rem" }}>
                  {s.station_name}
                </Link>
              ))}
            </div>
          </>
        )}

        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "1.6rem 0 .7rem" }}>
          Fler tågbolag
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
          {others.map((x) => (
            <Link key={x.slug} to={operatorPath(x)} className="btn" style={{ fontSize: ".92rem" }}>
              {x.name}
            </Link>
          ))}
          <Link to="/forseningar" className="btn" style={{ fontSize: ".92rem" }}>
            Alla stationer →
          </Link>
        </div>

        <p style={{ marginTop: "1.6rem", fontSize: ".85rem", color: "var(--muted)", lineHeight: 1.6 }}>
          Statistiken bygger på Trafikverkets realtidsdata. Ett tåg räknas som försenat om det var
          minst 5 (respektive 20) minuter sent vid någon uppmätt station längs rutten, och räknas
          till det bolag som Trafikverket märkt tåget med — märkningen kan skifta där bolag delar
          spår. Period: {period}.
        </p>
      </main>

      <Footer />
    </div>
  );
}
