import { useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/contexts/AuthContext";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { Nav, Footer } from "@/components/daylight/shell";

/**
 * "Installera Qvitta-genvägen" (`/genvag`) — standalone install guide for the iOS
 * Shortcut that autofills the BankID-gated operator forms (SL, Skånetrafiken,
 * Västtrafik; see docs/qvitta-shortcut.md and ShortcutClaimModal). It's the
 * discovery + onboarding surface: download link + the iOS settings the user must
 * flip before the Shortcut can run (iCloud Drive access, "Run JavaScript on Web
 * Page", Share Sheet). Daylight-themed, public, linked from the footer and the
 * claim hand-off modal.
 *
 * HOSTING: paste the iCloud share link of the finished Shortcut below. In the
 * Shortcuts app: long-press the "Qvitta" shortcut → Share → Copy iCloud Link.
 * Apple hosts the signed shortcut at that icloud.com/shortcuts/… URL; importing
 * from it needs no "Allow Untrusted Shortcuts" toggle. (Alternative: drop an
 * exported `.shortcut` file in `public/` and link it at qvitta.nu/qvitta.shortcut
 * — but the file import is "untrusted" and is the worse UX.)
 */
const SHORTCUT_ICLOUD_URL = "https://www.icloud.com/shortcuts/REPLACE_WITH_ICLOUD_ID";

const linkConfigured = !SHORTCUT_ICLOUD_URL.includes("REPLACE_WITH_ICLOUD_ID");

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document));

const card: React.CSSProperties = { marginBottom: 16 };
const stepNo: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: ".8rem", fontWeight: 600,
  letterSpacing: ".12em", color: "var(--accent-deep)",
};
const olStyle: React.CSSProperties = {
  margin: ".5rem 0 0", paddingLeft: "1.25rem", display: "flex",
  flexDirection: "column", gap: ".55rem", lineHeight: 1.5,
};

export default function ShortcutGuide() {
  useDaylightStyles();

  const { user, profile, signOut, signInWithGoogle } = useAuth();
  const onIOS = useMemo(() => isIOS(), []);

  const loginNext = location.pathname + location.search;
  const accountLabel = profile?.full_name || profile?.first_name || user?.email || "Konto";

  return (
    <div className="cmt-daylight">
      <Helmet>
        <title>Installera Qvitta-genvägen — Qvitta</title>
        <meta
          name="description"
          content="Ladda ner och installera Qvitta-genvägen för iPhone som fyller i operatörernas ersättningsformulär åt dig."
        />
      </Helmet>

      <Nav
        signedIn={Boolean(user)}
        accountLabel={accountLabel}
        onSignOut={() => void signOut()}
        onLogin={() => void signInWithGoogle(loginNext)}
      />

      <main className="wrap" style={{ paddingTop: "2rem", paddingBottom: "4rem", maxWidth: 720 }}>
        <p className="eyebrow">iPhone · Genväg</p>
        <h1 style={{ fontSize: "1.7rem", margin: ".25rem 0 .35rem" }}>Installera Qvitta-genvägen</h1>
        <p className="lead" style={{ margin: "0 0 1.5rem" }}>
          Vissa operatörer (SL, Skånetrafiken, Västtrafik) kräver BankID på sina egna formulär — då
          kan vi inte fylla i åt dig på servern. Istället gör en liten iPhone-genväg jobbet: den tar
          med din resa till formuläret och fyller i fälten medan du själv loggar in och skickar in.
          Du installerar den <b>en gång</b>.
        </p>

        {!onIOS && (
          <div className="board" style={{ ...card, borderColor: "var(--accent-deep)" }}>
            <p style={{ fontWeight: 600, margin: 0 }}>Det här är en iPhone-funktion</p>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Du verkar inte vara på en iPhone just nu. Öppna den här sidan på din iPhone för att
              installera genvägen — på dator öppnar vi istället operatörens formulär direkt så fyller
              du i manuellt.
            </p>
          </div>
        )}

        {/* Step 1 — download */}
        <div className="board" style={card}>
          <span style={stepNo}>STEG 1</span>
          <h2 style={{ fontSize: "1.1rem", margin: ".3rem 0 .4rem" }}>Ladda ner genvägen</h2>
          <p style={{ margin: "0 0 .9rem" }}>
            Öppna länken på din iPhone och tryck <b>Lägg till genväg</b>. Genvägen heter <b>Qvitta</b>.
          </p>
          {linkConfigured ? (
            <a className="btn btn--accent" href={SHORTCUT_ICLOUD_URL} target="_blank" rel="noopener noreferrer">
              Ladda ner Qvitta-genvägen
            </a>
          ) : (
            <button className="btn btn--accent" disabled title="Länken läggs in inom kort">
              Nedladdningslänk kommer snart
            </button>
          )}
          <p className="muted" style={{ margin: ".75rem 0 0" }}>
            Genvägen kommer från en signerad iCloud-länk — du behöver alltså <b>inte</b> slå på
            "Tillåt obetrodda genvägar".
          </p>
        </div>

        {/* Step 2 — required settings (the hiccups) */}
        <div className="board" style={card}>
          <span style={stepNo}>STEG 2</span>
          <h2 style={{ fontSize: "1.1rem", margin: ".3rem 0 .4rem" }}>Tillåt det genvägen behöver</h2>
          <p style={{ margin: "0 0 .4rem" }}>
            Första gången du kör genvägen frågar iPhone om lov ett par gånger — tryck <b>Tillåt</b> på
            varje:
          </p>
          <ol style={olStyle}>
            <li><b>Åtkomst till iCloud Drive</b> — genvägen sparar din resa tillfälligt där mellan stegen.</li>
            <li><b>Köra skript på webbsidor</b> — det är så fälten fylls i på operatörens sida.</li>
            <li><b>Hämta innehåll från qvitta.nu</b> — den hämtar rätt ifyllnad för operatören.</li>
          </ol>
          <p style={{ margin: "1rem 0 .4rem", fontWeight: 600 }}>Om ifyllnaden inte startar</p>
          <p className="muted" style={{ margin: 0 }}>
            Slå på skript-körning manuellt: <b>Inställningar → Appar → Genvägar → Avancerat →
            "Tillåt körning av skript"</b>. (På äldre iOS heter det <b>Inställningar → Genvägar →
            Avancerat</b>.) Kontrollera även att <b>"Visa i Delningsmeny"</b> är på i genvägens
            inställningar — annars syns inte Qvitta i Dela-menyn.
          </p>
        </div>

        {/* Step 3 — how to use */}
        <div className="board" style={card}>
          <span style={stepNo}>STEG 3</span>
          <h2 style={{ fontSize: "1.1rem", margin: ".3rem 0 .4rem" }}>Så använder du den vid en ansökan</h2>
          <ol style={olStyle}>
            <li>På qvitta.nu: öppna en försening → <b>Ansök</b> → <b>Öppna [operatör] via Qvitta</b>. Genvägen sparar resan och öppnar operatörens formulär.</li>
            <li>Logga in med <b>BankID</b>.</li>
            <li>När formuläret visas: öppna <b>Dela-menyn</b> i Safari och tryck på <b>Qvitta</b>. Fälten fylls i och en grön bekräftelse visas.</li>
            <li>Om ett senare steg inte fylls i automatiskt — kör <b>Dela → Qvitta</b> igen på det steget.</li>
            <li><b>Granska, välj rätt resa om du blir tillfrågad, och skicka in själv.</b> Qvitta skickar aldrig in åt dig.</li>
          </ol>
        </div>

        {/* Troubleshooting */}
        <div className="board" style={card}>
          <span style={stepNo}>FELSÖKNING</span>
          <h2 style={{ fontSize: "1.1rem", margin: ".3rem 0 .4rem" }}>Om något strular</h2>
          <ul style={{ ...olStyle, paddingLeft: "1.1rem", listStyle: "disc" }}>
            <li><b>Qvitta syns inte i Dela-menyn:</b> öppna genvägen, tryck på (i)-knappen och slå på "Visa i Delningsmeny". Den kan ligga längst ner i listan bakom "Redigera åtgärder".</li>
            <li><b>"Genvägen kunde inte köras":</b> kör Steg 2 igen — oftast är det skript-körning som inte är tillåten.</li>
            <li><b>Station/hållplats fylls inte i rätt:</b> skriv den själv och hör av dig — vi rättar sökningen på vår sida, du behöver inte göra om genvägen.</li>
            <li><b>Inget fylls i alls:</b> dubbelkolla att du startade flödet från qvitta.nu (Steg 3:1) — genvägen behöver resan därifrån för att veta vad den ska fylla i.</li>
          </ul>
          <p className="muted" style={{ margin: "1rem 0 0" }}>
            Får du inte igång den? Mejla oss så hjälper vi till.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
