import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { Nav, Footer } from "@/components/daylight/shell";

/**
 * Integritetspolicy (`/integritet`) — the GDPR-required privacy notice. Linked from
 * the footer and the FAQ. Keep this in sync with what the app ACTUALLY stores:
 * profiles (contact, optional personnummer/address/bank/signature), claims
 * (journey snapshots + booking refs), commute_routes, digest_log/digest_events.
 * The deletion/export rights it promises are implemented in Settings → Konto.
 */

const CONTACT_EMAIL = "kontakt@qvitta.nu";

const H2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "2rem 0 .5rem" }}>{children}</h2>
);

export default function Privacy() {
  useDaylightStyles();

  return (
    <div className="cmt-daylight">
      <Helmet>
        <title>Integritetspolicy — Qvitta</title>
        <meta
          name="description"
          content="Hur Qvitta hanterar dina personuppgifter: vad vi lagrar, varför, hur länge och vilka rättigheter du har."
        />
        <link rel="canonical" href="https://qvitta.nu/integritet" />
      </Helmet>

      <Nav signedIn={false} accountLabel="" onSignOut={() => {}} onLogin={() => {}} />

      <main className="wrap" style={{ paddingTop: "2.5rem", paddingBottom: "4rem", maxWidth: 720, lineHeight: 1.6 }}>
        <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 .5rem", lineHeight: 1.1 }}>
          Integritetspolicy
        </h1>
        <p className="muted" style={{ margin: "0 0 1.5rem" }}>Senast uppdaterad: 1 juli 2026</p>

        <p>
          Qvitta hjälper dig att ansöka om ersättning när ditt tåg är försenat eller inställt.
          För det behöver vi behandla personuppgifter. Den här sidan beskriver vilka uppgifter
          det gäller, varför vi behöver dem, hur länge de sparas och vilka rättigheter du har
          enligt dataskyddsförordningen (GDPR).
        </p>

        <H2>Personuppgiftsansvarig</H2>
        <p>
          Qvitta är personuppgiftsansvarig för behandlingen som beskrivs här. Kontakta oss på{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> för frågor om dina uppgifter.
        </p>

        <H2>Vilka uppgifter vi behandlar</H2>
        <ul style={{ paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: ".4rem" }}>
          <li><b>Kontouppgifter:</b> e-postadress och namn från din inloggning (Google eller e-post/lösenord).</li>
          <li><b>Ansökningsprofil (frivillig, du fyller i den själv):</b> namn, e-post, mobilnummer — och om du väljer att spara dem: personnummer, adress, bankuppgifter (clearing- och kontonummer) och en ritad signatur. Dessa används enbart för att fylla i ersättningsansökningar.</li>
          <li><b>Ansökningar:</b> när du ansöker sparar vi resan (sträcka, datum, försening), vald operatör och i förekommande fall boknings-/biljettnummer och den e-post du angav vid köpet.</li>
          <li><b>Bevakningar:</b> pendlingssträckor och tider du valt att bevaka, samt logg över vilka förseningar vi mejlat dig om.</li>
          <li><b>E-poststatistik:</b> om du valt att få sammanfattningsmejl registrerar vår e-postleverantör leverans-, öppnings- och klickhändelser.</li>
        </ul>
        <p className="muted" style={{ marginTop: ".5rem" }}>
          Vi använder inga annons- eller spårningskakor. Inloggningen lagras lokalt i din webbläsare.
        </p>

        <H2>Varför (rättslig grund)</H2>
        <ul style={{ paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: ".4rem" }}>
          <li><b>Fullgöra tjänsten</b> (avtal): förbereda och skicka in dina ersättningsansökningar, visa dina förseningar.</li>
          <li><b>Samtycke:</b> sammanfattningsmejl (kan stängas av när som helst i Inställningar) och varje enskild ansökan — du bekräftar alltid själv innan något skickas in.</li>
        </ul>

        <H2>Vem vi delar uppgifter med</H2>
        <ul style={{ paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: ".4rem" }}>
          <li><b>Operatören du ansöker hos</b> (t.ex. SJ) — de uppgifter deras formulär kräver, ingenting mer.</li>
          <li><b>Supabase</b> (databas och inloggning, EU-region) och <b>Resend</b> (e-postutskick) som personuppgiftsbiträden.</li>
          <li>Vi säljer aldrig dina uppgifter, och delar dem inte för marknadsföring.</li>
        </ul>
        <p className="muted" style={{ marginTop: ".5rem" }}>
          Öppnar du en operatörs eget formulär via Qvitta (eller använder iPhone-genvägen) skickas
          uppgifterna direkt från din enhet till operatören — de passerar inte våra servrar.
        </p>

        <H2>Hur länge</H2>
        <p>
          Uppgifterna sparas så länge du har ett konto. Trafikdata om förseningar (som inte är
          personuppgifter) sparas i upp till 90 dagar — samma period som du kan ansöka om
          ersättning. Raderar du kontot tas dina personuppgifter bort permanent.
        </p>

        <H2>Dina rättigheter</H2>
        <ul style={{ paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: ".4rem" }}>
          <li><b>Tillgång och dataportabilitet:</b> exportera allt vi har om dig som en fil under <Link to="/settings">Inställningar</Link>.</li>
          <li><b>Rättelse:</b> ändra dina uppgifter när som helst under Inställningar.</li>
          <li><b>Radering:</b> ta bort ditt konto och alla uppgifter under Inställningar → Konto. Raderingen är omedelbar och permanent.</li>
          <li><b>Klagomål:</b> du kan alltid vända dig till Integritetsskyddsmyndigheten (IMY) om du anser att vi hanterar dina uppgifter fel.</li>
        </ul>

        <H2>Kontakt</H2>
        <p>
          Frågor? Mejla <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <div style={{ marginTop: "2.5rem" }}>
          <Link to="/" className="btn btn--accent">Tillbaka till startsidan</Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
