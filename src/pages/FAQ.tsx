import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { Nav, Footer } from "@/components/daylight/shell";
// Content lives in src/content/faq.ts (single source for this page AND the
// build-time prerender in scripts/prerenderGuides.ts — keep them from drifting).
import { FAQ_ITEMS as ITEMS, faqPageJsonLd } from "@/content/faq";

// schema.org FAQPage markup — makes the Q&A eligible for rich results on the
// queries this page targets ("ersättning försenat tåg" etc.).
const FAQ_JSONLD = JSON.stringify(faqPageJsonLd());

export default function FAQ() {
  useDaylightStyles();

  return (
    <div className="cmt-daylight">
      <Helmet>
        <title>Vanliga frågor — Qvitta</title>
        <meta name="description" content="Vanliga frågor och svar om ersättning för försenade och inställda tåg." />
        <link rel="canonical" href="https://qvitta.nu/faq" />
        <script type="application/ld+json">{FAQ_JSONLD}</script>
      </Helmet>

      <Nav signedIn={false} accountLabel="" onSignOut={() => {}} onLogin={() => {}} />

      <main className="wrap" style={{ paddingTop: "2.5rem", paddingBottom: "4rem", maxWidth: 720 }}>
        <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 .5rem", lineHeight: 1.1 }}>
          Vanliga frågor
        </h1>
        <p className="lead" style={{ margin: "0 0 2.5rem", fontSize: "1.05rem", color: "var(--ink-2)", lineHeight: 1.5 }}>
          En samlad plats för att ansöka om förseningsersättning — pendlare, nattåg och allt därimellan.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {ITEMS.map((item, i) => (
            <details
              key={i}
              style={{
                border: "1px solid var(--line)",
                borderRadius: "var(--r-lg)",
                background: "var(--card-bg)",
                overflow: "hidden",
              }}
            >
              <summary
                style={{
                  padding: "1.15rem 1.3rem",
                  fontWeight: 600,
                  fontSize: "1.02rem",
                  cursor: "pointer",
                  listStyle: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  color: "var(--card-text)",
                }}
              >
                <span>{item.q}</span>
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: "1.2rem",
                    lineHeight: 1,
                    color: "var(--muted)",
                    transition: "transform .18s",
                    display: "inline-block",
                  }}
                >
                  +
                </span>
              </summary>
              <div
                style={{
                  padding: "0 1.3rem 1.15rem",
                  color: "var(--card-muted)",
                  fontSize: ".97rem",
                  lineHeight: 1.6,
                }}
              >
                {item.a}
              </div>
            </details>
          ))}
        </div>

        <div style={{ marginTop: "2.5rem", textAlign: "center" }}>
          <p className="muted" style={{ marginBottom: ".6rem" }}>Hittade du inte svaret du sökte?</p>
          <Link to="/" className="btn btn--accent">
            Tillbaka till startsidan
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
