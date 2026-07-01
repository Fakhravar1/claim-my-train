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

/**
 * Looping animated walkthrough of the Shortcut flow — a CSS-keyframe "screen
 * recording" (4 scenes × 4 s) instead of a GIF: crisp at any size, ~0 bytes of
 * assets, and editable in code when the flow changes. Class names are qvdemo-
 * prefixed so nothing collides with daylight.css inside .cmt-daylight.
 */
function ShortcutDemo() {
  const scenes = [
    {
      caption: "1. Öppna en försening på qvitta.nu och tryck ”Öppna via Qvitta”",
      body: (
        <>
          <div className="qvdemo__row"><span className="qvdemo__dot" />Malmö C → Stockholm C</div>
          <div className="qvdemo__tag">+42 min · Berättigad</div>
          <div className="qvdemo__btn qvdemo__btn--pulse">Öppna SL via Qvitta</div>
        </>
      ),
    },
    {
      caption: "2. Operatörens formulär öppnas — logga in med BankID",
      body: (
        <>
          <div className="qvdemo__bar" />
          <div className="qvdemo__bankid">BankID</div>
          <div className="qvdemo__line" style={{ width: "70%" }} />
          <div className="qvdemo__line" style={{ width: "50%" }} />
        </>
      ),
    },
    {
      caption: "3. Öppna Dela-menyn i Safari och kör Qvitta igen",
      body: (
        <>
          <div className="qvdemo__sheet">
            <div className="qvdemo__sheetrow">Kopiera länk</div>
            <div className="qvdemo__sheetrow qvdemo__sheetrow--hl">Qvitta</div>
            <div className="qvdemo__sheetrow">Lägg till bokmärke</div>
          </div>
        </>
      ),
    },
    {
      caption: "4. Fälten fylls i — granska och skicka in själv",
      body: (
        <>
          <div className="qvdemo__field qvdemo__field--fill">Malmö C</div>
          <div className="qvdemo__field qvdemo__field--fill" style={{ animationDelay: "0.4s" }}>Stockholm C</div>
          <div className="qvdemo__field qvdemo__field--fill" style={{ animationDelay: "0.8s" }}>2026-07-01 · 07:42</div>
          <div className="qvdemo__toast">Qvitta fyllde i 3 fält ✓</div>
        </>
      ),
    },
  ];

  return (
    <div className="qvdemo" aria-hidden="true">
      <style>{`
        .qvdemo { display:flex; flex-direction:column; align-items:center; gap:.75rem; margin:.5rem 0 1rem; }
        .qvdemo__phone { position:relative; width:230px; height:300px; border:3px solid var(--ink-2, #333);
          border-radius:26px; background:#fff; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,.12); }
        .qvdemo__notch { position:absolute; top:8px; left:50%; transform:translateX(-50%);
          width:70px; height:8px; border-radius:6px; background:var(--ink-2, #333); opacity:.25; z-index:2; }
        .qvdemo__scene { position:absolute; inset:0; padding:34px 18px 16px; display:flex; flex-direction:column;
          gap:10px; opacity:0; animation:qvdemoScene 16s infinite; }
        .qvdemo__scene:nth-child(2) { animation-delay:0s; }
        .qvdemo__scene:nth-child(3) { animation-delay:4s; }
        .qvdemo__scene:nth-child(4) { animation-delay:8s; }
        .qvdemo__scene:nth-child(5) { animation-delay:12s; }
        @keyframes qvdemoScene {
          0% { opacity:0; } 2% { opacity:1; } 23% { opacity:1; } 25% { opacity:0; } 100% { opacity:0; }
        }
        .qvdemo__row { font:600 13px/1.3 var(--font-body, system-ui); color:#111; display:flex; align-items:center; gap:6px; }
        .qvdemo__dot { width:8px; height:8px; border-radius:50%; background:#E4572E; flex:none; }
        .qvdemo__tag { align-self:flex-start; font:600 11px/1 var(--font-mono, monospace); color:#8a4f00;
          background:#FFF3E0; border:1px solid #F0C27B; border-radius:999px; padding:5px 9px; }
        .qvdemo__btn { margin-top:auto; text-align:center; font:600 13px/1 var(--font-body, system-ui);
          color:#fff; background:#0E8C7E; border-radius:10px; padding:11px 10px; }
        .qvdemo__btn--pulse { animation:qvdemoPulse 1.2s ease-in-out infinite; }
        @keyframes qvdemoPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.05); } }
        .qvdemo__bar { height:26px; border-radius:8px; background:#eef1f0; }
        .qvdemo__bankid { margin:auto; font:700 15px/1 var(--font-body, system-ui); color:#fff; background:#193E4F;
          border-radius:12px; padding:14px 26px; }
        .qvdemo__line { height:10px; border-radius:6px; background:#eef1f0; }
        .qvdemo__sheet { margin-top:auto; border:1px solid #e3e7e5; border-radius:14px 14px 0 0; overflow:hidden;
          box-shadow:0 -6px 18px rgba(0,0,0,.08); }
        .qvdemo__sheetrow { padding:11px 14px; font:500 13px/1 var(--font-body, system-ui); color:#333;
          border-bottom:1px solid #eef1f0; background:#fff; }
        .qvdemo__sheetrow--hl { font-weight:700; color:#0E8C7E; animation:qvdemoHl 1.4s ease-in-out infinite; }
        @keyframes qvdemoHl { 0%,100% { background:#fff; } 50% { background:#E2F7F0; } }
        .qvdemo__field { border:1px solid #d9e0dd; border-radius:8px; padding:9px 10px;
          font:500 12px/1 var(--font-body, system-ui); color:#111; opacity:.25; animation:qvdemoFill .5s forwards; }
        .qvdemo__field--fill { animation-delay:0s; }
        @keyframes qvdemoFill { to { opacity:1; border-color:#0E8C7E; background:#F2FBF8; } }
        .qvdemo__toast { margin-top:auto; text-align:center; font:600 12px/1 var(--font-body, system-ui);
          color:#fff; background:#0E8C7E; border-radius:8px; padding:9px 8px; }
        .qvdemo__caption { position:relative; width:100%; max-width:320px; height:2.6em; }
        .qvdemo__caption span { position:absolute; inset:0; text-align:center; font-size:.85rem; color:var(--ink-2, #555);
          opacity:0; animation:qvdemoScene 16s infinite; }
        .qvdemo__caption span:nth-child(1) { animation-delay:0s; }
        .qvdemo__caption span:nth-child(2) { animation-delay:4s; }
        .qvdemo__caption span:nth-child(3) { animation-delay:8s; }
        .qvdemo__caption span:nth-child(4) { animation-delay:12s; }
        @media (prefers-reduced-motion: reduce) {
          .qvdemo__scene, .qvdemo__caption span { animation-duration: 32s; }
          .qvdemo__btn--pulse, .qvdemo__sheetrow--hl { animation: none; }
        }
      `}</style>
      <div className="qvdemo__phone">
        <div className="qvdemo__notch" />
        {scenes.map((s, i) => (
          <div className="qvdemo__scene" key={i}>{s.body}</div>
        ))}
      </div>
      <div className="qvdemo__caption">
        {scenes.map((s, i) => (
          <span key={i}>{s.caption}</span>
        ))}
      </div>
    </div>
  );
}

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
          Du installerar den <b>en gång</b>. Så här ser flödet ut:
        </p>

        <ShortcutDemo />

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
