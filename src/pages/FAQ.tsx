import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { Nav, Footer } from "@/components/daylight/shell";

const ITEMS = [
  {
    q: "Vad är Qvitta?",
    a: "Qvitta är en tjänst som hjälper dig att få ersättning när ditt tåg är försenat eller inställt. Vi bevakar trafiken i realtid, upptäcker förseningar som ger rätt till ersättning och hjälper dig att skicka in ansökan hos operatören.",
  },
  {
    q: "Hur fungerar det?",
    a: "Sök fram din sträcka och datum så visar vi vilka avgångar som var försenade eller inställda. När du hittar din resa klickar du på \"Ansök om ersättning\" och fyller i dina uppgifter — vi sköter resten åt dig.",
  },
  {
    q: "Hur mycket ersättning kan jag få?",
    a: "Det beror på operatören och hur lång förseningen var. För Skånetrafiken gäller 50 % vid 20–39 minuter, 75 % vid 40–59 minuter och 100 % vid 60 minuter eller mer. För SJ och längre sträckor gäller andra regler enligt EU-förordning 2021/782.",
  },
  {
    q: "Vilka operatörer stöds?",
    a: "Vi stöder för närvarande Skånetrafiken, Öresundståg, SJ, Vy, Kalmar länstrafik, SL och Västtrafik. Vissa operatörer hanteras direkt i appen och andra vidarekopplar vi till deras egna formulär.",
  },
  {
    q: "Kostar det något?",
    a: "Nej, Qvitta är helt gratis att använda. Ersättningen betalas ut direkt från operatören till dig — pengarna passerar aldrig oss.",
  },
  {
    q: "Vad behöver jag för information?",
    a: "Du behöver veta vilken sträcka du reste och ungefär vilken tid. Om du kommer ihåg avgångstiden hjälper det oss att hitta rätt tåg. Du behöver också fylla i dina kontakt- och utbetalningsuppgifter en gång i Inställningar.",
  },
  {
    q: "Hur lång tid tar det att få ersättning?",
    a: "Det varierar mellan operatörer. Skånetrafiken behandlar vanligtvis ärenden inom några veckor. När din ansökan är skickad kan du följa statusen under Inställningar → Mina ärenden.",
  },
  {
    q: "Behöver jag spara min biljett?",
    a: "Ja, det är bra att spara din biljett eller bokningsbekräftelse som kvitto på att du reste. Vissa operatörer begär biljettnummer vid ansökan.",
  },
  {
    q: "Hur vet ni att mitt tåg verkligen var försenat?",
    a: "Vi använder officiell trafikdata från Trafikverket och Trafiklab i realtid. Informationen uppdateras löpande så att vi kan matcha din resa mot de faktiska avgångs- och ankomsttiderna.",
  },
  {
    q: "Vad händer med mina personuppgifter?",
    a: "Dina uppgifter lagras säkert och används enbart för att skicka in din ersättningsansökan. Vi delar dem endast med den operatör du ansöker hos. Läs mer i vår integritetspolicy på qvitta.nu/integritet — där ser du också hur du exporterar eller raderar dina uppgifter.",
  },
];

// schema.org FAQPage markup — makes the Q&A eligible for rich results on the
// queries this page targets ("ersättning försenat tåg" etc.). Derived from ITEMS
// so the markup can never drift from the visible content.
const FAQ_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  inLanguage: "sv",
  mainEntity: ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
});

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
