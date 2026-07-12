/**
 * SEO content for /ersattning (pillar) + /ersattning/<operator> (guides).
 *
 * Single source of truth consumed by BOTH renderers:
 *  - the React pages (src/pages/Ersattning.tsx, src/pages/ErsattningGuide.tsx)
 *  - the build-time prerender step (scripts/prerenderGuides.ts) that writes
 *    crawlable static HTML into dist/ — this is what Google actually reads.
 *
 * MUST stay dependency-free: it is imported by vite.config.ts (esbuild, Node)
 * at build time, so no React/JSX/browser imports here.
 *
 * Factual claims: the statutory tiers come from Lag (2015:953) 15 § and
 * EU 2021/782 art. 19 — same numbers as dbt/seeds/dim_compensation_rules.csv.
 * Operator specifics (deadlines, form mechanics) verified against operator
 * pages 2026-07-07; keep `updated` fresh when revising.
 */

export type GuideBlock =
  | { t: "h2"; text: string }
  | { t: "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "table"; header: string[]; rows: string[][] };

export type GuideFaq = { q: string; a: string };

export type Guide = {
  /** URL slug under /ersattning/ ("" = the pillar page itself). */
  slug: string;
  /** Operator display name (used in link lists and breadcrumbs). */
  operator: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  lead: string;
  blocks: GuideBlock[];
  faq: GuideFaq[];
  /** The operator's own claim/info page (external). */
  officialUrl?: string;
  officialLabel?: string;
  /** True when Qvitta files this operator's claims in-app (CTA leads with Qvitta). */
  inAppFiling?: boolean;
  /** ISO date shown as "Uppdaterad" and used in Article JSON-LD. */
  updated: string;
};

const UPDATED = "2026-07-08";

export const SITE = "https://qvitta.nu";

export const guideUrl = (slug: string) =>
  slug ? `${SITE}/ersattning/${slug}` : `${SITE}/ersattning`;

export const guidePath = (slug: string) =>
  slug ? `/ersattning/${slug}` : "/ersattning";

/* ------------------------------------------------------------------ */
/* Pillar: /ersattning                                                 */
/* ------------------------------------------------------------------ */

export const PILLAR: Guide = {
  slug: "",
  operator: "Alla operatörer",
  metaTitle: "Ersättning för försenat tåg — så får du pengar tillbaka | Qvitta",
  metaDescription:
    "Försenat eller inställt tåg? Vid 20 minuters försening har du ofta rätt till 50–100 % av biljettpriset. Guide till reglerna, beloppen och hur du ansöker — per operatör.",
  h1: "Ersättning för försenat tåg — så får du pengar tillbaka",
  lead:
    "När tåget är mer än 20 minuter försenat har du i de flesta fall laglig rätt till förseningsersättning — men bara om du ansöker. Här är reglerna, beloppen och fristerna för ersättning vid försenat eller inställt tåg, samlade på ett ställe.",
  blocks: [
    { t: "h2", text: "Dina rättigheter i korthet" },
    {
      t: "table",
      header: ["Resans längd", "Försening", "Ersättning"],
      rows: [
        ["Under 150 km (pendel- och regionaltåg)", "20–39 min", "50 % av biljettpriset"],
        ["Under 150 km", "40–59 min", "75 % av biljettpriset"],
        ["Under 150 km", "60 min eller mer", "100 % av biljettpriset"],
        ["150 km eller längre (fjärrtåg)", "60–119 min", "25 % av biljettpriset"],
        ["150 km eller längre", "120 min eller mer", "50 % av biljettpriset"],
      ],
    },
    {
      t: "p",
      text:
        "Inställda avgångar räknas också: blir du försenad till din slutstation för att tåget ställdes in har du rätt till ersättning på samma nivåer.",
    },
    { t: "h2", text: "Två regelverk styr — resans längd avgör vilket" },
    {
      t: "p",
      text:
        "Kortare resor (under 150 km) omfattas av lagen om kollektivtrafikresenärers rättigheter (2015:953). Den ger ersättning redan vid 20 minuters försening — det gäller pendeltåg, Pågatåg, Öresundståg, Västtågen, Mälartåg och de flesta regionala resor. Längre resor omfattas i stället av EU:s tågpassagerarförordning (2021/782), där ersättningen börjar vid 60 minuter. Flera operatörer, till exempel Skånetrafiken, är frivilligt generösare än lagen kräver och tillämpar 20-minutersregeln på all sin trafik.",
    },
    { t: "h2", text: "Taxi eller egen bil när tåget inte kommer" },
    {
      t: "p",
      text:
        "Om det finns skälig anledning att tro att du blir mer än 20 minuter sen (kortare resor) har du dessutom rätt att ordna egen transport — taxi, egen bil eller annan kollektivtrafik — och få utlägget ersatt upp till 1/40 av prisbasbeloppet, vilket 2026 motsvarar ungefär 1 500 kronor. Spara alltid kvitton i original.",
    },
    { t: "h2", text: "Så ansöker du" },
    {
      t: "ul",
      items: [
        "Ansökan görs alltid hos operatören eller länstrafikbolaget — inte hos Trafikverket eller staten.",
        "Du behöver veta sträcka, datum och ungefärlig avgångstid, och i regel kunna visa biljett eller bokningsnummer.",
        "Fristerna är korta: de flesta bolag kräver ansökan inom två månader, Västtrafik inom 60 dagar. Vänta inte.",
        "Qvitta bevakar tågtrafiken i realtid med data från Trafikverket — sök din sträcka så ser du direkt vilka avgångar som ger rätt till ersättning, och vi hjälper dig skicka in ansökan.",
      ],
    },
    { t: "h2", text: "Undantag som är bra att känna till" },
    {
      t: "ul",
      items: [
        "Tidtabellsändringar som meddelats i god tid i förväg (mer än tre dygn) kan räknas mot den ändrade tidtabellen i stället för den ursprungliga.",
        "För långdistanståg (EU-reglerna) kan operatören neka ersättning vid extraordinära omständigheter, till exempel extremväder — det gäller däremot inte den svenska 20-minutersregeln för kortare resor.",
        "För periodkort (månadskort, årskort) räknas ersättningen på ett framräknat snittpris per resa, inte på hela kortpriset.",
      ],
    },
  ],
  faq: [
    {
      q: "Hur försenat måste tåget vara för att ge ersättning?",
      a: "För resor under 150 km räcker 20 minuter — då har du rätt till 50 % av biljettpriset, 75 % vid 40 minuter och 100 % vid 60 minuter. För längre resor (fjärrtåg) börjar ersättningen vid 60 minuter med 25 %, och 50 % vid 120 minuter.",
    },
    {
      q: "Gäller ersättningen även när tåget ställs in?",
      a: "Ja. Ett inställt tåg som gör att du når din slutstation senare än planerat ger rätt till ersättning på samma nivåer som en försening.",
    },
    {
      q: "Hur långt i efterhand kan jag ansöka?",
      a: "Det varierar per bolag men fristerna är korta — vanligtvis två månader från resan, hos Västtrafik 60 dagar. Ansök så snart som möjligt.",
    },
    {
      q: "Vart skickar jag ansökan?",
      a: "Till operatören eller länstrafikbolaget som sålde biljetten — SJ för SJ-resor, Skånetrafiken i Skåne, SL i Stockholm och så vidare. För Öresundståg gäller länstrafikbolaget i länet där resan startade. Qvitta hjälper dig hitta rätt.",
    },
    {
      q: "Vad kostar det att använda Qvitta?",
      a: "Ingenting. Qvitta är gratis och ersättningen betalas ut direkt från operatören till dig.",
    },
  ],
  updated: "2026-07-12",
};

/* ------------------------------------------------------------------ */
/* Operator guides: /ersattning/<slug>                                 */
/* ------------------------------------------------------------------ */

export const GUIDES: Guide[] = [
  {
    slug: "sj",
    operator: "SJ",
    metaTitle: "SJ förseningsersättning — så ansöker du och så mycket får du | Qvitta",
    metaDescription:
      "Försenat SJ-tåg? Resans längd avgör: 50–100 % tillbaka vid 20–60 min på kortare resor, 25–50 % vid 60–120 min på längre. Så ansöker du — utan inloggning.",
    h1: "Förseningsersättning hos SJ",
    lead:
      "SJ:s ersättning styrs av hur lång resan är: kortare resor ger pengar tillbaka redan vid 20 minuters försening, längre resor vid 60 minuter. Ansökan görs med bokningsnumret — inget SJ-konto behövs.",
    blocks: [
      { t: "h2", text: "Så mycket får du tillbaka" },
      {
        t: "table",
        header: ["Resans längd", "Försening vid ankomst", "Ersättning"],
        rows: [
          ["Under 150 km", "20–39 min", "50 % av biljettpriset"],
          ["Under 150 km", "40–59 min", "75 % av biljettpriset"],
          ["Under 150 km", "60 min eller mer", "100 % av biljettpriset"],
          ["150 km eller längre", "60–119 min", "25 % av biljettpriset"],
          ["150 km eller längre", "120 min eller mer", "50 % av biljettpriset"],
        ],
      },
      {
        t: "p",
        text:
          "En resa Stockholm–Göteborg eller Malmö–Stockholm räknas som lång (EU-reglerna, ersättning från 60 minuter), medan en SJ-regionaltågsresa som Uppsala–Stockholm faller under den svenska lagen med ersättning redan vid 20 minuter. Inställda tåg ger ersättning på samma nivåer om du blir försenad till slutstationen.",
      },
      { t: "h2", text: "Så ansöker du hos SJ — steg för steg" },
      {
        t: "p",
        text:
          "Ansökan görs i SJ:s webbformulär utan inloggning. Du behöver bara bokningsnumret (8 eller 12 tecken) och den e-postadress eller det mobilnummer som användes vid köpet. Formuläret har fyra steg:",
      },
      {
        t: "ul",
        items: [
          "Hämta resa: fyll i bokningsnumret och e-postadressen eller mobilnumret från köpet.",
          "Välj resa: bocka för den försenade resan i listan och gå vidare.",
          "Egna utlägg: har du kvitton på merkostnader (taxi, mat, hotell) lägger du till dem här — annars hoppar du över steget. Det är bara för merkostnader SJ frågar efter utbetalningssätt; själva förseningsersättningen går alltid tillbaka till det betalsätt du använde vid köpet.",
          "Personuppgifter: namn, mobilnummer och e-post — bekräfta uppgifterna och tryck på Slutför ansökan.",
        ],
      },
      {
        t: "p",
        text:
          "När ansökan gått igenom visas ”Din ansökan är registrerad!” tillsammans med ett ärendenummer (formatet 1-XXXXXXXX). Spara det — det är din referens om du behöver kontakta SJ:s kundservice. Står det i stället att ansökan är delvis registrerad har förseningsersättningen gått igenom men inte utläggsdelen; komplettera merkostnaderna via kundservice.",
      },
      { t: "h2", text: "Om SJ inte hittar din bokning" },
      {
        t: "ul",
        items: [
          "Resan måste vara genomförd — formuläret hittar inte bokningar före avgång. Vänta tills du kommit fram och försök igen.",
          "Använd exakt den e-postadress eller det mobilnummer som angavs vid köpet — det är inte alltid samma som ditt SJ-konto, och köpte någon annan biljetten är det köparens uppgifter som gäller.",
          "Resplus-biljetter (flera operatörer på samma biljett, t.ex. köpta via en länstrafikapp) hanteras inte i SJ:s formulär utan via Resplus resegaranti.",
          "Varje bokning ger bara en ansökan — har du redan ansökt får du beskedet direkt.",
        ],
      },
      { t: "h2", text: "Kan SJ neka ersättning?" },
      {
        t: "p",
        text:
          "För längre resor (EU-förordningen) kan SJ neka ersättning vid extraordinära omständigheter utanför järnvägens kontroll, till exempel extremväder. För kortare resor som faller under den svenska lagen finns inget sådant undantag — där gäller 20-minutersregeln oavsett orsak. Tidtabellsändringar som meddelats mer än tre dygn i förväg räknas dock mot den nya tidtabellen, inte den ursprungliga.",
      },
      { t: "h2", text: "Eller låt Qvitta göra det åt dig" },
      {
        t: "p",
        text:
          "Qvitta bevakar SJ:s trafik i realtid med Trafikverkets data. Hittar du din försenade avgång hos oss anger du bara bokningsnumret — vi kontrollerar direkt mot SJ att bokningen stämmer och skickar sedan in ansökan åt dig. Du ser status och SJ:s ärendenummer under Mina ärenden.",
      },
    ],
    faq: [
      {
        q: "Hur försenat måste ett SJ-tåg vara för ersättning?",
        a: "Minst 20 minuter för resor under 150 km (50 % tillbaka), och minst 60 minuter för längre resor (25 % tillbaka, 50 % vid 120 minuter).",
      },
      {
        q: "Hur betalar SJ ut ersättningen?",
        a: "Ersättningen för förseningen återbetalas till det betalsätt du använde när du köpte biljetten. Merkostnader med kvitton hanteras separat.",
      },
      {
        q: "Behöver jag ett SJ-konto för att ansöka?",
        a: "Nej. SJ:s formulär kräver ingen inloggning — bokningsnummer plus den e-post eller det telefonnummer som användes vid köpet räcker.",
      },
      {
        q: "Kan Qvitta skicka in min SJ-ansökan?",
        a: "Ja. Ange ditt bokningsnummer när du hittat din försenade avgång, så validerar vi bokningen mot SJ och skickar in ansökan åt dig. Helt gratis.",
      },
      {
        q: "Vad betyder ”Vi hittar inte din bokning”?",
        a: "Oftast att resan inte är genomförd ännu (sök efter ankomst), eller att e-postadressen/mobilnumret inte matchar det som användes vid köpet. Resplus-biljetter hanteras dessutom via Resplus resegaranti, inte SJ:s formulär.",
      },
      {
        q: "Vad är ärendenumret och var hittar jag det?",
        a: "En referens i formatet 1-XXXXXXXX som visas på bekräftelsesidan när ansökan registrerats. Ansöker du via Qvitta sparar vi ärendenumret åt dig under Mina ärenden.",
      },
      {
        q: "Kan SJ neka min ansökan, till exempel vid oväder?",
        a: "Bara för längre resor under EU-reglerna, och bara vid extraordinära omständigheter utanför järnvägens kontroll. För kortare resor under svenska lagen gäller ersättningen oavsett orsak till förseningen.",
      },
      {
        q: "Måste jag ansöka inom en viss tid?",
        a: "Vänta inte — ansök så snart resan är genomförd. Då finns bokningen lätt till hands och du riskerar inga frister. Qvitta flaggar dina försenade avgångar automatiskt om du anger dina resvanor.",
      },
    ],
    officialUrl: "https://www.sj.se/om-sj/regler-och-villkor/rattigheter-vid-forsening",
    officialLabel: "SJ: rättigheter vid försening",
    inAppFiling: true,
    updated: "2026-07-12",
  },

  {
    slug: "skanetrafiken",
    operator: "Skånetrafiken",
    metaTitle: "Skånetrafiken förseningsersättning — 50–100 % tillbaka vid 20 min | Qvitta",
    metaDescription:
      "Försenat Pågatåg eller Öresundståg? Skånetrafiken ersätter 50–100 % av biljettpriset redan vid 20 minuters försening — även till och från Danmark. Så ansöker du.",
    h1: "Förseningsersättning hos Skånetrafiken",
    lead:
      "Skånetrafiken tillämpar 20-minutersregeln på all sin trafik — tåg, buss och Öresundståg till och från Danmark. Blir du 20 minuter sen har du rätt till halva biljettpriset tillbaka, och hela vid en timme.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Försening vid ankomst", "Ersättning"],
        rows: [
          ["20–39 minuter", "50 % av biljettpriset"],
          ["40–59 minuter", "75 % av biljettpriset"],
          ["60 minuter eller mer", "100 % av biljettpriset"],
        ],
      },
      {
        t: "ul",
        items: [
          "Inställda avgångar ger ersättning på samma nivåer om du blir försenad till din slutstation.",
          "Reglerna gäller hela Skånetrafikens trafik — Pågatågen, Öresundståg och bussarna — inklusive resor över Öresund till och från Danmark.",
          "För periodkort (30-dagars, årskort) räknas ersättningen på ett snittpris per resa.",
          "Vid befarad försening över 20 minuter kan du i stället ta taxi eller egen bil och få utlägget ersatt upp till lagens tak (cirka 1 500 kr). Spara kvitton.",
        ],
      },
      { t: "h2", text: "Så ansöker du" },
      {
        t: "p",
        text:
          "Ansökan görs i Skånetrafikens webbformulär och kräver BankID. Du anger sträcka, datum och avgång samt hur du vill få pengarna. Ansök inom två månader från resan — äldre ärenden prövas i regel inte.",
      },
      { t: "h2", text: "Snabbare med Qvitta" },
      {
        t: "p",
        text:
          "Qvitta visar alla ersättningsgrundande avgångar i Skåne i realtid — sök din sträcka och se direkt om ditt tåg ger rätt till ersättning. Har du iPhone kan Qvittas genväg dessutom fylla i Skånetrafikens formulär åt dig efter att du loggat in med BankID.",
      },
    ],
    faq: [
      {
        q: "Hur försenat måste tåget vara hos Skånetrafiken?",
        a: "20 minuter räcker. Då får du 50 % av biljettpriset tillbaka, 75 % vid 40 minuter och 100 % vid 60 minuter eller mer.",
      },
      {
        q: "Gäller ersättningen Öresundståg till Danmark?",
        a: "Ja. Skånetrafikens förseningsersättning gäller även resor med Öresundståg till och från Danmark, till exempel Malmö–Köpenhamn.",
      },
      {
        q: "Hur lång tid har jag på mig att ansöka?",
        a: "Ansök inom två månader från resan. Ansökan görs med BankID i Skånetrafikens webbformulär.",
      },
      {
        q: "Kan jag få ersättning för taxi?",
        a: "Ja, vid befarad försening över 20 minuter kan du ordna egen transport och få utlägget ersatt upp till cirka 1 500 kr mot kvitto.",
      },
    ],
    officialUrl:
      "https://www.skanetrafiken.se/kundservice/forseningsersattning/ansokan-om-ersattning/",
    officialLabel: "Skånetrafikens ansökningsformulär",
    updated: UPDATED,
  },

  {
    slug: "sl",
    operator: "SL",
    metaTitle: "SL förseningsersättning — ersättning vid 20 minuters försening | Qvitta",
    metaDescription:
      "Försenat pendeltåg eller tunnelbana i Stockholm? SL:s förseningsersättning gäller redan vid befarad försening över 20 minuter — taxi, egen bil eller biljettersättning. Så ansöker du.",
    h1: "Förseningsersättning hos SL",
    lead:
      "SL:s ersättning fungerar annorlunda än de flesta tågbolags: den utgår redan när din resa befaras bli mer än 20 minuter försenad, och ersätter i första hand utlägg för annan transport — taxi, egen bil eller annan kollektivtrafik.",
    blocks: [
      { t: "h2", text: "Så fungerar SL:s förseningsersättning" },
      {
        t: "ul",
        items: [
          "Om din resa med SL — pendeltåg, tunnelbana, buss eller lokalbana — befaras bli mer än 20 minuter försenad får du ordna egen transport och begära ersättning för utlägget.",
          "Taxi, egen bil och annan kollektivtrafik ersätts upp till ett maxbelopp per resa (lagens tak är 1/40 av prisbasbeloppet, cirka 1 500 kr). Spara alltid kvitton.",
          "Du kan också ha rätt till prisavdrag på biljetten enligt lagen om kollektivtrafikresenärers rättigheter: 50 % vid 20 minuter, 75 % vid 40 och 100 % vid 60 minuters faktisk försening.",
          "Förseningen räknas mot SL:s tidtabell — även utebliven trafikinformation kan vägas in.",
        ],
      },
      { t: "h2", text: "Så ansöker du" },
      {
        t: "p",
        text:
          "Ansökan görs i SL:s webbformulär på sl.se och kräver BankID. Ange resan, förseningen och dina utlägg, och bifoga kvitton. Ansök så snart som möjligt — SL:s frist är kort (två månader).",
      },
      { t: "h2", text: "Hitta din försening med Qvitta" },
      {
        t: "p",
        text:
          "Qvitta bevakar pendeltågstrafiken i Stockholm i realtid. Sök din sträcka och se direkt vilka avgångar som var försenade eller inställda — sedan tar du med dig uppgifterna till SL:s formulär, som vi länkar dig direkt till.",
      },
    ],
    faq: [
      {
        q: "När har jag rätt till ersättning från SL?",
        a: "Redan när din resa befaras bli mer än 20 minuter försenad. Då kan du ta taxi, egen bil eller annan kollektivtrafik och få utlägget ersatt mot kvitto.",
      },
      {
        q: "Ersätter SL taxi?",
        a: "Ja, vid befarad försening över 20 minuter — upp till ett maxbelopp per resa. Kvitto krävs.",
      },
      {
        q: "Gäller ersättningen pendeltåget?",
        a: "Ja. SL:s förseningsersättning gäller all SL-trafik: pendeltåg, tunnelbana, buss, spårvagn och lokalbana.",
      },
      {
        q: "Hur ansöker jag hos SL?",
        a: "I SL:s webbformulär på sl.se, med BankID. Ansök inom två månader från resan.",
      },
    ],
    officialUrl: "https://sl.se/kundservice/forseningsersattning/resan",
    officialLabel: "SL:s ansökningsformulär",
    updated: UPDATED,
  },

  {
    slug: "vasttrafik",
    operator: "Västtrafik",
    metaTitle: "Västtrafik förseningsersättning — så ansöker du inom 60 dagar | Qvitta",
    metaDescription:
      "Försenat tåg med Västtrafik? Vid 20 minuters försening får du 50–100 % av biljettpriset tillbaka, eller taxi/egen bil ersatt upp till 1 350 kr. Ansök inom 60 dagar — så gör du.",
    h1: "Förseningsersättning hos Västtrafik",
    lead:
      "Västtrafik ersätter 50–100 % av biljettpriset redan vid 20 minuters försening — och taxi eller egen bil upp till 1 350 kronor om du väljer att ta dig fram på egen hand. Men fristen är kort: 60 dagar.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Försening", "Ersättning"],
        rows: [
          ["20–39 minuter", "50 % av enkelbiljettpriset (minst 50 kr som värdekod)"],
          ["40–59 minuter", "75 % av enkelbiljettpriset"],
          ["60 minuter eller mer", "100 % av enkelbiljettpriset"],
        ],
      },
      {
        t: "ul",
        items: [
          "Väljer du värdekod i stället för utbetalning till bankkonto får du mer i ersättning — och alltid minst 50 kr.",
          "Räknar du med att bli minst 20 minuter sen kan du i stället ta taxi eller egen bil och få upp till 1 350 kr ersatt. Originalkvitto krävs för taxi.",
          "Reglerna gäller all Västtrafiks trafik: Västtågen, spårvagn, buss och båt.",
          "Inställda avgångar ger ersättning på samma villkor om du blir försenad till din slutstation.",
        ],
      },
      { t: "h2", text: "Så ansöker du — inom 60 dagar" },
      {
        t: "p",
        text:
          "Ansökan görs i Västtrafiks digitala formulär. Du anger resan, förseningen och hur du vill ha ersättningen (bankkonto eller värdekod) och signerar med BankID. Fristen är 60 dagar från resan — kortare än hos de flesta andra bolag, så vänta inte.",
      },
      { t: "h2", text: "Hitta din försening med Qvitta" },
      {
        t: "p",
        text:
          "Qvitta bevakar tågtrafiken i Västra Götaland i realtid med Trafikverkets data. Sök din sträcka — till exempel Göteborg–Alingsås eller Göteborg–Borås — och se direkt vilka avgångar som ger rätt till ersättning, med länk vidare till Västtrafiks formulär.",
      },
    ],
    faq: [
      {
        q: "Hur försenad måste resan vara hos Västtrafik?",
        a: "20 minuter räcker för ersättning: 50 % av biljettpriset vid 20 minuter, 75 % vid 40 och 100 % vid 60 minuter eller mer.",
      },
      {
        q: "Hur lång tid har jag på mig att ansöka?",
        a: "60 dagar från resan — en av de kortaste fristerna bland svenska trafikbolag.",
      },
      {
        q: "Ersätter Västtrafik taxi eller egen bil?",
        a: "Ja, vid befarad försening på minst 20 minuter ersätts taxi eller egen bil upp till 1 350 kr. Originalkvitto krävs.",
      },
      {
        q: "Gäller ersättningen Västtågen?",
        a: "Ja — tåg, spårvagn, buss och båt i Västtrafiks trafik omfattas alla av samma förseningsersättning.",
      },
    ],
    officialUrl: "https://www.vasttrafik.se/kundservice/forseningsersattning/ansok-om-ersattning/",
    officialLabel: "Västtrafiks ansökningsformulär",
    updated: UPDATED,
  },

  {
    slug: "oresundstag",
    operator: "Öresundståg",
    metaTitle: "Öresundståg förseningsersättning — rätt bolag för ditt län | Qvitta",
    metaDescription:
      "Försenat Öresundståg? Ansökan görs hos länstrafikbolaget där resan startade — Skånetrafiken, Hallandstrafiken, Västtrafik med flera. Se vart du ska vända dig och hur mycket du får.",
    h1: "Förseningsersättning för Öresundståg — vart ska du vända dig?",
    lead:
      "Öresundståg körs över sex svenska län och Danmark, och det finns inget centralt ställe att ansöka på. Regeln är enkel men okänd: du ansöker hos länstrafikbolaget i det län där din resa började.",
    blocks: [
      { t: "h2", text: "Rätt bolag beror på var resan startade" },
      {
        t: "table",
        header: ["Resan startade i", "Ansök hos"],
        rows: [
          ["Skåne", "Skånetrafiken"],
          ["Danmark (t.ex. Köpenhamn)", "Skånetrafiken"],
          ["Halland", "Hallandstrafiken"],
          ["Västra Götaland", "Västtrafik"],
          ["Kronoberg", "Länstrafiken Kronoberg"],
          ["Blekinge", "Blekingetrafiken"],
          ["Kalmar län", "Kalmar länstrafik"],
        ],
      },
      {
        t: "p",
        text:
          "Startade resan i Danmark — till exempel Köpenhamn eller Kastrup — är det alltså Skånetrafiken som hanterar ersättningen, inte DSB.",
      },
      { t: "h2", text: "Så mycket får du" },
      {
        t: "p",
        text:
          "Ersättningen följer den svenska lagen om kollektivtrafikresenärers rättigheter: 50 % av biljettpriset vid 20 minuters försening, 75 % vid 40 minuter och 100 % vid 60 minuter eller mer. Inställda tåg räknas på samma sätt. Skånetrafiken tillämpar dessutom reglerna fullt ut även på resor över Öresund.",
      },
      { t: "h2", text: "Slipp lista ut det själv" },
      {
        t: "p",
        text:
          "Qvitta bevakar hela Öresundstågsnätet i realtid och räknar automatiskt ut vilket länstrafikbolag som gäller för just din resa, baserat på var den startade. Sök din sträcka, se förseningen och kom direkt till rätt formulär.",
      },
    ],
    faq: [
      {
        q: "Var ansöker jag om ersättning för ett försenat Öresundståg?",
        a: "Hos länstrafikbolaget i det län där resan startade — Skånetrafiken för resor från Skåne och Danmark, Hallandstrafiken från Halland, Västtrafik från Västra Götaland och så vidare.",
      },
      {
        q: "Jag åkte från Köpenhamn — vem ansvarar?",
        a: "Skånetrafiken. Resor med Öresundståg som startar i Danmark hanteras av Skånetrafiken, med samma ersättningsnivåer som i Skåne.",
      },
      {
        q: "Hur mycket ersättning ger ett försenat Öresundståg?",
        a: "50 % av biljettpriset vid 20 minuter, 75 % vid 40 minuter och 100 % vid 60 minuter eller mer — även vid inställda avgångar.",
      },
    ],
    officialUrl: "https://www.oresundstag.se/kundservice/forseningsersattning",
    officialLabel: "Öresundståg om förseningsersättning",
    updated: UPDATED,
  },

  {
    slug: "malartag",
    operator: "Mälartåg",
    metaTitle: "Mälartåg förseningsersättning — 50–100 % tillbaka vid försening | Qvitta",
    metaDescription:
      "Försenat Mälartåg? Vid 20 minuters försening har du rätt till 50–100 % av biljettpriset. Ansök hos Mälardalstrafik inom två månader — så gör du.",
    h1: "Förseningsersättning hos Mälartåg",
    lead:
      "Mälartåg trafikerar Stockholm, Uppsala, Sörmland, Västmanland, Örebro och Östergötland. Blir tåget 20 minuter försenat har du rätt till halva biljettpriset tillbaka — ansökan görs hos Mälardalstrafik.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Försening vid ankomst", "Ersättning"],
        rows: [
          ["20–39 minuter", "50 % av biljettpriset"],
          ["40–59 minuter", "75 % av biljettpriset"],
          ["60 minuter eller mer", "100 % av biljettpriset"],
        ],
      },
      {
        t: "ul",
        items: [
          "Nivåerna följer lagen om kollektivtrafikresenärers rättigheter och gäller även inställda avgångar.",
          "Reser du med Movingo eller annat periodkort räknas ersättningen på ett snittpris per resa.",
          "Vid befarad försening över 20 minuter kan du ordna egen transport och få utlägget ersatt upp till lagens tak (cirka 1 500 kr) mot kvitto.",
        ],
      },
      { t: "h2", text: "Så ansöker du" },
      {
        t: "p",
        text:
          "Ansökan görs i Mälardalstrafiks digitala formulär. Ange sträcka, datum och avgång samt biljettuppgifter. Ansök inom två månader från resan.",
      },
      { t: "h2", text: "Hitta din försening med Qvitta" },
      {
        t: "p",
        text:
          "Qvitta bevakar Mälartågs linjer i realtid — Stockholm–Eskilstuna–Örebro, Nyköpingsbanan, Uppsala–Sala och övriga sträckor. Sök din resa och se direkt om avgången ger rätt till ersättning, med länk vidare till Mälardalstrafiks formulär.",
      },
    ],
    faq: [
      {
        q: "Hur försenat måste ett Mälartåg vara för ersättning?",
        a: "20 minuter räcker: då får du 50 % av biljettpriset, 75 % vid 40 minuter och 100 % vid 60 minuter eller mer.",
      },
      {
        q: "Var ansöker jag om ersättning för Mälartåg?",
        a: "Hos Mälardalstrafik, i deras digitala formulär. Ansök inom två månader från resan.",
      },
      {
        q: "Gäller ersättningen Movingo-kort?",
        a: "Ja. För periodkort som Movingo räknas ersättningen på ett framräknat snittpris per resa.",
      },
    ],
    officialUrl: "https://www.malardalstrafik.se/kundservice/ansoek-om-ersaettning-vid-foersening/",
    officialLabel: "Mälardalstrafiks ansökningsformulär",
    updated: UPDATED,
  },

  {
    slug: "snalltaget",
    operator: "Snälltåget",
    metaTitle: "Snälltåget förseningsersättning — 25–50 % tillbaka, så ansöker du | Qvitta",
    metaDescription:
      "Försenat Snälltåg? Vid 60 minuters försening får du 25 % av biljettpriset tillbaka, vid 120 minuter 50 %. Ansökan görs under Min resa på snalltaget.se — inom två månader.",
    h1: "Förseningsersättning hos Snälltåget",
    lead:
      "Snälltåget kör långdistans — Malmö–Stockholm och nattågen mot Åre och Berlin — så EU:s tågpassagerarförordning gäller: ersättningen börjar vid 60 minuters försening till slutstationen.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Försening vid ankomst", "Ersättning"],
        rows: [
          ["60–119 minuter", "25 % av biljettpriset"],
          ["120 minuter eller mer", "50 % av biljettpriset"],
        ],
      },
      { t: "h2", text: "Så ansöker du" },
      {
        t: "ul",
        items: [
          "Gå till Min resa på snalltaget.se och logga in med bokningsnummer och e-postadress.",
          "När det sista tåget i bokningen har kommit fram visas knappen \"Försenad?\" i bokningen — klicka där för att skicka in ansökan.",
          "Ansökan kan göras först när hela resan är genomförd, och senast två månader efter resan.",
        ],
      },
      { t: "h2", text: "Undantagen" },
      {
        t: "ul",
        items: [
          "Ingen ersättning om du informerades om förseningen innan du köpte biljetten.",
          "Ingen ersättning vid extraordinära omständigheter, till exempel extremt väder eller sabotage.",
          "Merkostnader som förlorad arbetsinkomst ersätts inte.",
        ],
      },
      { t: "h2", text: "Hitta din försening med Qvitta" },
      {
        t: "p",
        text:
          "Qvitta bevakar Snälltågets avgångar i realtid med Trafikverkets data. Sök din sträcka och se hur försenat tåget faktiskt var vid ankomsten — det är den siffran ersättningen räknas på.",
      },
    ],
    faq: [
      {
        q: "Hur försenat måste Snälltåget vara för ersättning?",
        a: "Minst 60 minuter vid ankomsten till din slutstation — då får du 25 % av biljettpriset. Vid 120 minuter eller mer får du 50 %.",
      },
      {
        q: "Hur ansöker jag hos Snälltåget?",
        a: "Under Min resa på snalltaget.se, med bokningsnummer och e-post. Knappen \"Försenad?\" visas i bokningen när resan är avslutad. Ansök inom två månader.",
      },
      {
        q: "Gäller ersättningen nattågen till Berlin och Åre?",
        a: "Ja, samma EU-regler gäller hela Snälltågets trafik: 25 % vid 60 minuter och 50 % vid 120 minuters försening.",
      },
    ],
    officialUrl: "https://www.snalltaget.se/min-resa",
    officialLabel: "Snälltåget: Min resa",
    updated: UPDATED,
  },

  {
    slug: "vy",
    operator: "Vy Tåg",
    metaTitle: "Vy Tåg förseningsersättning — nattåg och regionaltåg | Qvitta",
    metaDescription:
      "Försenat tåg med Vy? För nattågen och andra långa resor gäller 25 % tillbaka vid 60 minuter och 50 % vid 120 minuter. Ansökan görs utan inloggning — så gör du.",
    h1: "Förseningsersättning hos Vy Tåg",
    lead:
      "Vy kör bland annat nattågen mellan Stockholm och övre Norrland. För de långa resorna gäller EU:s tågpassagerarregler — ersättning från 60 minuters försening — och ansökan görs i ett webbformulär utan inloggning.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Resans längd", "Försening vid ankomst", "Ersättning"],
        rows: [
          ["150 km eller längre (t.ex. nattågen)", "60–119 min", "25 % av biljettpriset"],
          ["150 km eller längre", "120 min eller mer", "50 % av biljettpriset"],
          ["Under 150 km", "20/40/60 min", "50/75/100 % enligt svensk lag"],
        ],
      },
      { t: "h2", text: "Så ansöker du" },
      {
        t: "ul",
        items: [
          "Vy:s ersättningsformulär kräver ingen inloggning: du anger bokningsnummer, kontaktuppgifter, tågnummer, avgångs- och ankomststation samt hur du vill få ersättningen (bankkonto, bankgiro eller postgiro).",
          "Kvitton för biljett och eventuella utlägg kan bifogas men är inte obligatoriska.",
          "Ansök så snart som möjligt efter resan — operatörernas frister är i regel korta (omkring två månader).",
        ],
      },
      { t: "h2", text: "Eller låt Qvitta göra det åt dig" },
      {
        t: "p",
        text:
          "Qvitta bevakar Vy:s tåg i realtid. Hittar du din försenade avgång hos oss anger du bokningsnumret, granskar den ifyllda ansökan och godkänner — så skickar vi in den till Vy åt dig.",
      },
    ],
    faq: [
      {
        q: "Hur försenat måste ett Vy-tåg vara för ersättning?",
        a: "För nattågen och andra resor på 150 km eller längre: minst 60 minuter (25 % tillbaka) eller 120 minuter (50 %). För kortare resor gäller den svenska lagens 20-minutersregel.",
      },
      {
        q: "Behöver jag ett konto hos Vy för att ansöka?",
        a: "Nej. Vy:s formulär kräver ingen inloggning — bokningsnummer och kontaktuppgifter räcker.",
      },
      {
        q: "Kan Qvitta skicka in min Vy-ansökan?",
        a: "Ja. Ange bokningsnumret när du hittat din försenade avgång, granska och godkänn — vi fyller i och skickar in formuläret åt dig.",
      },
    ],
    officialUrl: "https://www.vy.se/kundservice",
    officialLabel: "Vy kundservice",
    updated: UPDATED,
  },

  {
    slug: "tagibergslagen",
    operator: "Tåg i Bergslagen",
    metaTitle: "Tåg i Bergslagen förseningsersättning — 50–100 % vid 20 min | Qvitta",
    metaDescription:
      "Försenat tåg i Bergslagen? Vid 20 minuters försening får du 50–100 % av biljettpriset tillbaka. Ansök inom två månader — så gör du.",
    h1: "Förseningsersättning hos Tåg i Bergslagen",
    lead:
      "Tåg i Bergslagen binder ihop Örebro, Västerås, Falun, Gävle och Mjölby. Blir tåget 20 minuter försenat har du rätt till halva biljettpriset tillbaka — och hela vid en timme.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Försening vid ankomst", "Ersättning"],
        rows: [
          ["20–39 minuter", "50 % av biljettpriset"],
          ["40–59 minuter", "75 % av biljettpriset"],
          ["60 minuter eller mer", "100 % av biljettpriset"],
        ],
      },
      {
        t: "ul",
        items: [
          "För periodkort räknas ersättningen på ett snittpris per resa (30-dagarskort delas med 22, årskort med 264).",
          "Vid befarad försening över 20 minuter kan du ordna egen transport och få utlägget ersatt upp till lagens tak, cirka 1 500 kr, mot kvitto.",
          "Ansökan ska vara inne inom två månader från resan.",
        ],
      },
      { t: "h2", text: "Så ansöker du" },
      {
        t: "p",
        text:
          "Ansökan görs i Tåg i Bergslagens digitala ersättningsformulär. Ange sträcka, datum, avgång och biljettuppgifter. Qvitta bevakar trafiken i Bergslagen i realtid — sök din sträcka så ser du direkt om avgången ger rätt till ersättning.",
      },
    ],
    faq: [
      {
        q: "Hur försenat måste tåget vara hos Tåg i Bergslagen?",
        a: "20 minuter räcker: 50 % av biljettpriset tillbaka, 75 % vid 40 minuter och 100 % vid 60 minuter eller mer.",
      },
      {
        q: "Hur lång tid har jag på mig att ansöka?",
        a: "Två månader från resan. Ansökan görs i Tåg i Bergslagens digitala formulär.",
      },
    ],
    officialUrl: "https://evf.tagibergslagen.regionvastmanland.se",
    officialLabel: "Tåg i Bergslagens ansökningsformulär",
    updated: UPDATED,
  },

  {
    slug: "ul",
    operator: "UL (Upptåget)",
    metaTitle: "UL förseningsersättning — Upptåget och tågen i Uppsala län | Qvitta",
    metaDescription:
      "Försenat Upptåg eller annat tåg med UL-biljett? Vid 20 minuters försening har du rätt till 50–100 % av biljettpriset. Så ansöker du hos UL.",
    h1: "Förseningsersättning hos UL",
    lead:
      "Reser du med UL-biljett i Uppsala län — på Upptåget mot Gävle eller Sala, eller på regionaltågen — ger 20 minuters försening rätt till ersättning enligt den svenska kollektivtrafiklagen.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Försening vid ankomst", "Ersättning"],
        rows: [
          ["20–39 minuter", "50 % av biljettpriset"],
          ["40–59 minuter", "75 % av biljettpriset"],
          ["60 minuter eller mer", "100 % av biljettpriset"],
        ],
      },
      { t: "h2", text: "Vilka resor gäller det?" },
      {
        t: "p",
        text:
          "Ersättningen gäller resor med UL:s biljetter — Upptåget Uppsala–Gävle och Uppsala–Sala samt UL:s bussar. Reser du med SJ- eller Mälartågsbiljett på samma sträcka är det i stället SJ respektive Mälardalstrafik du vänder dig till; det är biljetten som avgör, inte tåget.",
      },
      { t: "h2", text: "Så ansöker du" },
      {
        t: "ul",
        items: [
          "Ansökan görs i UL:s webbformulär för förseningsersättning — ange resa, datum och biljettuppgifter.",
          "Vid befarad försening över 20 minuter kan du i stället ta taxi eller egen bil och få utlägget ersatt upp till lagens tak, cirka 1 500 kr, mot kvitto.",
          "Ansök så snart som möjligt — fristen är kort (omkring två månader).",
        ],
      },
    ],
    faq: [
      {
        q: "Hur försenat måste Upptåget vara för ersättning?",
        a: "20 minuter räcker: 50 % av biljettpriset tillbaka, 75 % vid 40 minuter och 100 % vid 60 minuter eller mer.",
      },
      {
        q: "Jag åkte Upptåget med SJ-biljett — vem ansöker jag hos?",
        a: "Hos den som sålde biljetten. UL-biljett → UL, SJ-biljett → SJ, Movingo/Mälartågsbiljett → Mälardalstrafik.",
      },
    ],
    officialUrl: "https://www.ul.se/kundservice/forseningsersattning/formular-forseningsersattning/",
    officialLabel: "UL:s ansökningsformulär",
    updated: UPDATED,
  },

  {
    slug: "ostgotatrafiken",
    operator: "Östgötatrafiken",
    metaTitle: "Östgötatrafiken förseningsersättning — Östgötapendeln | Qvitta",
    metaDescription:
      "Försenad Östgötapendel? Vid 20 minuters försening har du rätt till 50–100 % av biljettpriset tillbaka. Så ansöker du hos Östgötatrafiken.",
    h1: "Förseningsersättning hos Östgötatrafiken",
    lead:
      "Östgötapendeln mellan Norrköping, Linköping, Mjölby och Motala omfattas av den svenska kollektivtrafiklagen: 20 minuters försening ger rätt till halva biljettpriset tillbaka.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Försening vid ankomst", "Ersättning"],
        rows: [
          ["20–39 minuter", "50 % av biljettpriset"],
          ["40–59 minuter", "75 % av biljettpriset"],
          ["60 minuter eller mer", "100 % av biljettpriset"],
        ],
      },
      {
        t: "ul",
        items: [
          "Gäller resor med Östgötatrafikens biljetter — Östgötapendeln och bussarna. Inställda avgångar räknas på samma sätt.",
          "Vid befarad försening över 20 minuter kan du ordna egen transport och få utlägget ersatt upp till lagens tak, cirka 1 500 kr, mot kvitto.",
          "För periodkort räknas ersättningen på ett snittpris per resa.",
        ],
      },
      { t: "h2", text: "Så ansöker du" },
      {
        t: "p",
        text:
          "Ansökan görs i Östgötatrafikens webbformulär — ange resa, datum och biljettuppgifter, och ansök så snart som möjligt efter resan. Qvitta bevakar Östgötapendeln i realtid: sök din sträcka, till exempel Linköping–Norrköping, och se direkt vilka avgångar som ger rätt till ersättning.",
      },
    ],
    faq: [
      {
        q: "Hur försenad måste Östgötapendeln vara för ersättning?",
        a: "20 minuter räcker: 50 % av biljettpriset tillbaka, 75 % vid 40 minuter och 100 % vid 60 minuter eller mer.",
      },
      {
        q: "Jag åkte med SJ-biljett genom Östergötland — vem ansöker jag hos?",
        a: "Hos SJ. Det är biljetten som avgör: Östgötatrafikens ersättning gäller resor köpta hos Östgötatrafiken.",
      },
    ],
    officialUrl: "https://www.ostgotatrafiken.se/kundservice/vanliga-arenden/forseningsersattning/",
    officialLabel: "Östgötatrafikens ansökningsformulär",
    updated: UPDATED,
  },

  {
    slug: "jlt",
    operator: "Jönköpings Länstrafik",
    metaTitle: "JLT förseningsersättning — Krösatågen i Jönköpings län | Qvitta",
    metaDescription:
      "Försenat Krösatåg i Jönköpings län? Vid 20 minuters försening har du rätt till 50–100 % av biljettpriset. Så ansöker du hos JLT.",
    h1: "Förseningsersättning hos Jönköpings Länstrafik",
    lead:
      "Krösatågen kring Jönköping, Nässjö och Värnamo omfattas av kollektivtrafiklagen: blir tåget 20 minuter försenat har du rätt till ersättning från JLT — om du reste på JLT:s biljett.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Försening vid ankomst", "Ersättning"],
        rows: [
          ["20–39 minuter", "50 % av biljettpriset"],
          ["40–59 minuter", "75 % av biljettpriset"],
          ["60 minuter eller mer", "100 % av biljettpriset"],
        ],
      },
      {
        t: "ul",
        items: [
          "Gäller resor med JLT:s biljetter på Krösatågen och länets bussar; inställda avgångar räknas på samma sätt.",
          "Vid befarad försening över 20 minuter kan du ta taxi eller egen bil och få utlägget ersatt upp till lagens tak, cirka 1 500 kr, mot kvitto.",
          "Krösatågen körs över flera län — det är biljetten som avgör vilket länstrafikbolag du ansöker hos.",
        ],
      },
      { t: "h2", text: "Så ansöker du" },
      {
        t: "p",
        text:
          "Ansökan görs i JLT:s webbformulär för förseningsersättning; ange resa, datum och biljettuppgifter och ansök så snart som möjligt. Qvitta bevakar Krösatågen i realtid — sök din sträcka och se direkt om din avgång ger rätt till ersättning.",
      },
    ],
    faq: [
      {
        q: "Hur försenat måste Krösatåget vara för ersättning?",
        a: "20 minuter räcker: 50 % av biljettpriset tillbaka, 75 % vid 40 minuter och 100 % vid 60 minuter eller mer.",
      },
      {
        q: "Krösatågen går över länsgränsen — vem ansöker jag hos?",
        a: "Hos bolaget som sålde biljetten: JLT-biljett → JLT, Krösatågsresa på KLT-biljett → Kalmar länstrafik, och så vidare.",
      },
    ],
    officialUrl: "https://www.jlt.se/kundservice/forseningsersattning/",
    officialLabel: "JLT:s ansökningsformulär",
    updated: UPDATED,
  },

  {
    slug: "varmlandstrafik",
    operator: "Värmlandstrafik",
    metaTitle: "Värmlandstrafik förseningsersättning — tågen i Värmland | Qvitta",
    metaDescription:
      "Försenat tåg i Värmland? Vid 20 minuters försening har du rätt till 50–100 % av biljettpriset tillbaka. Så ansöker du hos Värmlandstrafik.",
    h1: "Förseningsersättning hos Värmlandstrafik",
    lead:
      "Värmlandstrafiks tåg — på Värmlandsbanan mot Karlstad och Fryksdalsbanan mot Torsby — omfattas av kollektivtrafiklagen: 20 minuters försening ger rätt till halva biljettpriset tillbaka.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Försening vid ankomst", "Ersättning"],
        rows: [
          ["20–39 minuter", "50 % av biljettpriset"],
          ["40–59 minuter", "75 % av biljettpriset"],
          ["60 minuter eller mer", "100 % av biljettpriset"],
        ],
      },
      {
        t: "ul",
        items: [
          "Gäller resor med Värmlandstrafiks biljetter; inställda avgångar räknas på samma sätt.",
          "Vid befarad försening över 20 minuter kan du ordna egen transport och få utlägget ersatt upp till lagens tak, cirka 1 500 kr, mot kvitto.",
          "Ansök så snart som möjligt efter resan — fristen är kort (omkring två månader).",
        ],
      },
      { t: "h2", text: "Så ansöker du" },
      {
        t: "p",
        text:
          "Ansökan görs i Värmlandstrafiks webbformulär för förseningsersättning. Qvitta bevakar tågen i Värmland i realtid — sök din sträcka, till exempel Karlstad–Kristinehamn, och se direkt om avgången ger rätt till ersättning.",
      },
    ],
    faq: [
      {
        q: "Hur försenat måste tåget vara hos Värmlandstrafik?",
        a: "20 minuter räcker: 50 % av biljettpriset tillbaka, 75 % vid 40 minuter och 100 % vid 60 minuter eller mer.",
      },
      {
        q: "Jag åkte SJ-tåg genom Värmland — vem ansöker jag hos?",
        a: "Hos SJ, om biljetten är köpt hos SJ. Värmlandstrafiks ersättning gäller resor på deras egna biljetter.",
      },
    ],
    officialUrl: "https://www.varmlandstrafik.se/varmlandstrafik/kundservice/forseningsersattning",
    officialLabel: "Värmlandstrafiks ansökningsformulär",
    updated: UPDATED,
  },

  {
    slug: "hallandstrafiken",
    operator: "Hallandstrafiken",
    metaTitle: "Hallandstrafiken förseningsersättning — Öresundståg & Krösatåg | Qvitta",
    metaDescription:
      "Försenat tåg i Halland? Vid 20 minuters försening har du rätt till 50–100 % av biljettpriset. Hallandstrafiken hanterar även Öresundståg som startar i Halland — så ansöker du.",
    h1: "Förseningsersättning hos Hallandstrafiken",
    lead:
      "Hallandstrafiken ersätter förseningar på resor med deras biljetter — och hanterar dessutom alla Öresundstågsresor som startar i Halland, oavsett biljett. 20 minuter räcker för ersättning.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Försening vid ankomst", "Ersättning"],
        rows: [
          ["20–39 minuter", "50 % av biljettpriset"],
          ["40–59 minuter", "75 % av biljettpriset"],
          ["60 minuter eller mer", "100 % av biljettpriset"],
        ],
      },
      { t: "h2", text: "Vilka resor gäller det?" },
      {
        t: "ul",
        items: [
          "Resor med Hallandstrafikens biljetter — tåg och buss i Halland; inställda avgångar räknas på samma sätt.",
          "Öresundståg vars resa startade i Halland (t.ex. Halmstad–Malmö) — ansökan görs hos Hallandstrafiken, inte hos Skånetrafiken.",
          "Vid befarad försening över 20 minuter kan du ta taxi eller egen bil och få utlägget ersatt upp till lagens tak, cirka 1 500 kr, mot kvitto.",
        ],
      },
      { t: "h2", text: "Så ansöker du" },
      {
        t: "p",
        text:
          "Ansökan görs i Hallandstrafikens webbformulär för reklamation och förseningsersättning; ange resa, datum och biljettuppgifter och ansök så snart som möjligt. Qvitta bevakar tågen genom Halland i realtid — sök din sträcka så ser du direkt om din avgång ger rätt till ersättning, och vi pekar dig till rätt bolag.",
      },
    ],
    faq: [
      {
        q: "Hur försenat måste tåget vara i Halland?",
        a: "20 minuter räcker: 50 % av biljettpriset tillbaka, 75 % vid 40 minuter och 100 % vid 60 minuter eller mer.",
      },
      {
        q: "Mitt Öresundståg från Halmstad var försenat — vem ansöker jag hos?",
        a: "Hos Hallandstrafiken. För Öresundståg gäller länstrafikbolaget i länet där resan startade — startade den i Halland är det Hallandstrafiken.",
      },
    ],
    officialUrl:
      "https://hallandstrafiken.se/kundservice/vanliga-arenden/forseningsersattning-och-reklamation/reklamation",
    officialLabel: "Hallandstrafikens ansökningsformulär",
    updated: UPDATED,
  },

  {
    slug: "kalmar",
    operator: "Kalmar länstrafik",
    metaTitle: "Kalmar länstrafik förseningsersättning — Krösatåg & Kustpilen | Qvitta",
    metaDescription:
      "Försenat tåg i Kalmar län? Vid 20 minuters försening har du rätt till 50–100 % av biljettpriset. Så ansöker du hos Kalmar länstrafik.",
    h1: "Förseningsersättning hos Kalmar länstrafik",
    lead:
      "Krösatågen och Kustpilen mot Linköping samt Öresundstågen från Kalmar omfattas av kollektivtrafiklagen — 20 minuters försening ger rätt till halva biljettpriset tillbaka.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Försening vid ankomst", "Ersättning"],
        rows: [
          ["20–39 minuter", "50 % av biljettpriset"],
          ["40–59 minuter", "75 % av biljettpriset"],
          ["60 minuter eller mer", "100 % av biljettpriset"],
        ],
      },
      {
        t: "ul",
        items: [
          "Gäller resor med KLT:s biljetter — Krösatågen, Kustpilen på Stångådals- och Tjustbanan samt bussarna. Öresundståg som startar i Kalmar län hanteras också av KLT.",
          "Ersättningen betalas ofta ut som värdekod att använda på nya resor.",
          "Vid befarad försening över 20 minuter kan du ordna egen transport och få utlägget ersatt upp till lagens tak, cirka 1 500 kr, mot kvitto.",
        ],
      },
      { t: "h2", text: "Så ansöker du — eller låt Qvitta göra det" },
      {
        t: "p",
        text:
          "Ansökan görs i KLT:s webbformulär med biljett- eller app-uppgifter. Hittar du din försenade avgång hos Qvitta kan vi fylla i ansökan åt dig: du granskar den ifyllda ansökan och godkänner innan något skickas in.",
      },
    ],
    faq: [
      {
        q: "Hur försenat måste tåget vara i Kalmar län?",
        a: "20 minuter räcker: 50 % av biljettpriset tillbaka, 75 % vid 40 minuter och 100 % vid 60 minuter eller mer.",
      },
      {
        q: "Hur betalas ersättningen ut?",
        a: "Kalmar länstrafik betalar ofta ut ersättningen som värdekod som du använder vid nästa biljettköp.",
      },
      {
        q: "Kan Qvitta skicka in min KLT-ansökan?",
        a: "Ja. Ange dina biljettuppgifter när du hittat din försenade avgång, granska den ifyllda ansökan och godkänn — sedan skickar vi in den.",
      },
    ],
    officialUrl: "https://kalmarlanstrafik.se/Kundservice/ansok-om-forseningsersattning/",
    officialLabel: "KLT:s ansökningsformulär",
    updated: UPDATED,
  },

  {
    slug: "kronoberg",
    operator: "Länstrafiken Kronoberg",
    metaTitle: "Länstrafiken Kronoberg förseningsersättning — tågen via Växjö | Qvitta",
    metaDescription:
      "Försenat tåg i Kronoberg? Vid 20 minuters försening har du rätt till 50–100 % av biljettpriset. Så ansöker du hos Länstrafiken Kronoberg.",
    h1: "Förseningsersättning hos Länstrafiken Kronoberg",
    lead:
      "Öresundstågen och Krösatågen genom Växjö och Alvesta omfattas av kollektivtrafiklagen: 20 minuters försening ger rätt till halva biljettpriset tillbaka — och Öresundståg som startar i Kronoberg hanteras just av Länstrafiken Kronoberg.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Försening vid ankomst", "Ersättning"],
        rows: [
          ["20–39 minuter", "50 % av biljettpriset"],
          ["40–59 minuter", "75 % av biljettpriset"],
          ["60 minuter eller mer", "100 % av biljettpriset"],
        ],
      },
      {
        t: "ul",
        items: [
          "Gäller resor med Länstrafiken Kronobergs biljetter, och Öresundstågsresor som startade i Kronobergs län (t.ex. Växjö–Malmö).",
          "Inställda avgångar räknas på samma sätt som förseningar.",
          "Vid befarad försening över 20 minuter kan du ta taxi eller egen bil och få utlägget ersatt upp till lagens tak, cirka 1 500 kr, mot kvitto.",
        ],
      },
      { t: "h2", text: "Så ansöker du" },
      {
        t: "p",
        text:
          "Ansökan görs i Länstrafiken Kronobergs webbformulär; ange resa, datum och biljettuppgifter och ansök så snart som möjligt. Qvitta bevakar tågen genom Kronoberg i realtid — sök din sträcka så ser du direkt om din avgång ger rätt till ersättning.",
      },
    ],
    faq: [
      {
        q: "Hur försenat måste tåget vara i Kronoberg?",
        a: "20 minuter räcker: 50 % av biljettpriset tillbaka, 75 % vid 40 minuter och 100 % vid 60 minuter eller mer.",
      },
      {
        q: "Mitt Öresundståg från Växjö var försenat — vem ansöker jag hos?",
        a: "Hos Länstrafiken Kronoberg — för Öresundståg gäller länstrafikbolaget i länet där resan startade.",
      },
    ],
    officialUrl: "https://lanstrafikenkron.se/ansok-om-forseningsersattning",
    officialLabel: "Länstrafiken Kronobergs ansökningsformulär",
    updated: UPDATED,
  },

  {
    slug: "blekingetrafiken",
    operator: "Blekingetrafiken",
    metaTitle: "Blekingetrafiken förseningsersättning — Öresundståg i Blekinge | Qvitta",
    metaDescription:
      "Försenat tåg på Blekinge kustbana? Vid 20 minuters försening har du rätt till 50–100 % av biljettpriset. Så ansöker du hos Blekingetrafiken.",
    h1: "Förseningsersättning hos Blekingetrafiken",
    lead:
      "Öresundstågen på Blekinge kustbana — Karlskrona, Ronneby, Karlshamn mot Malmö — omfattas av kollektivtrafiklagen: 20 minuters försening ger rätt till halva biljettpriset tillbaka.",
    blocks: [
      { t: "h2", text: "Ersättningsnivåerna" },
      {
        t: "table",
        header: ["Försening vid ankomst", "Ersättning"],
        rows: [
          ["20–39 minuter", "50 % av biljettpriset"],
          ["40–59 minuter", "75 % av biljettpriset"],
          ["60 minuter eller mer", "100 % av biljettpriset"],
        ],
      },
      {
        t: "ul",
        items: [
          "Gäller resor med Blekingetrafikens biljetter, och Öresundstågsresor som startade i Blekinge (t.ex. Karlskrona–Malmö).",
          "Inställda avgångar räknas på samma sätt som förseningar.",
          "Vid befarad försening över 20 minuter kan du ta taxi eller egen bil och få utlägget ersatt upp till lagens tak, cirka 1 500 kr, mot kvitto.",
        ],
      },
      { t: "h2", text: "Så ansöker du" },
      {
        t: "p",
        text:
          "Ansökan görs i Blekingetrafikens webbformulär för resegaranti; ange resa, datum och biljettuppgifter och ansök så snart som möjligt. Qvitta bevakar Blekinge kustbana i realtid — sök din sträcka så ser du direkt om din avgång ger rätt till ersättning.",
      },
    ],
    faq: [
      {
        q: "Hur försenat måste tåget vara i Blekinge?",
        a: "20 minuter räcker: 50 % av biljettpriset tillbaka, 75 % vid 40 minuter och 100 % vid 60 minuter eller mer.",
      },
      {
        q: "Mitt Öresundståg från Karlskrona var försenat — vem ansöker jag hos?",
        a: "Hos Blekingetrafiken — för Öresundståg gäller länstrafikbolaget i länet där resan startade.",
      },
    ],
    officialUrl: "https://respons.blekingetrafiken.se/internet/bltresegarantiv2.aspx",
    officialLabel: "Blekingetrafikens resegarantiformulär",
    updated: UPDATED,
  },

  {
    slug: "arlandaexpress",
    operator: "Arlanda Express",
    metaTitle: "Arlanda Express försening — så reklamerar du | Qvitta",
    metaDescription:
      "Försenat Arlanda Express? Bolaget har en egen reklamationsprocess, och EU:s tågpassagerarregler ger ersättning vid längre förseningar. Så gör du.",
    h1: "Försenat Arlanda Express — det här gäller",
    lead:
      "Arlanda Express är ett kommersiellt flygtågsbolag med egen reklamationshantering — det omfattas inte av länstrafikens resegarantier. Vid längre förseningar ger EU:s tågpassagerarregler ändå en lägsta nivå.",
    blocks: [
      { t: "h2", text: "Dina rättigheter" },
      {
        t: "ul",
        items: [
          "EU:s tågpassagerarförordning ger minst 25 % av biljettpriset tillbaka vid 60 minuters försening och 50 % vid 120 minuter — det är golvet som gäller alla tågbolag.",
          "Arlanda Express hanterar ersättningskrav genom sin egen reklamationsprocess på arlandaexpress.se — där anger du resa, biljett och vad som hände.",
          "Missade du flyget på grund av förseningen? Ta med det i reklamationen och spara alla underlag — sådana krav prövas från fall till fall.",
        ],
      },
      { t: "h2", text: "Så reklamerar du" },
      {
        t: "p",
        text:
          "Använd reklamationsformuläret på arlandaexpress.se under Hjälp och support. Ange avgångstid, biljettnummer och förseningen. Qvitta bevakar Arlanda Express-avgångarna i realtid — hos oss ser du exakt hur försenat tåget var, vilket är underlaget du behöver.",
      },
    ],
    faq: [
      {
        q: "Ger ett försenat Arlanda Express rätt till ersättning?",
        a: "Vid 60 minuters försening ger EU-reglerna minst 25 % av biljettpriset tillbaka, vid 120 minuter 50 %. Arlanda Express hanterar kraven via sin egen reklamation.",
      },
      {
        q: "Var reklamerar jag?",
        a: "På arlandaexpress.se under Hjälp och support → Reklamation. Ange resa, biljettnummer och hur stor förseningen blev.",
      },
    ],
    officialUrl: "https://www.arlandaexpress.se/hjalp-och-support/reklamation",
    officialLabel: "Arlanda Express reklamation",
    updated: UPDATED,
  },
];

export const ALL_GUIDE_PAGES: Guide[] = [PILLAR, ...GUIDES];

/* ------------------------------------------------------------------ */
/* JSON-LD builders (shared by React pages and the prerender step)     */
/* ------------------------------------------------------------------ */

export function faqJsonLd(guide: Guide): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "sv",
    mainEntity: guide.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function articleJsonLd(guide: Guide): object {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.h1,
    description: guide.metaDescription,
    inLanguage: "sv",
    dateModified: guide.updated,
    mainEntityOfPage: guideUrl(guide.slug),
    author: { "@type": "Organization", name: "Qvitta", url: SITE },
    publisher: { "@type": "Organization", name: "Qvitta", url: SITE },
  };
}

export function breadcrumbJsonLd(guide: Guide): object {
  const items = [
    { "@type": "ListItem", position: 1, name: "Qvitta", item: `${SITE}/` },
    { "@type": "ListItem", position: 2, name: "Förseningsersättning", item: `${SITE}/ersattning` },
  ];
  if (guide.slug) {
    items.push({
      "@type": "ListItem",
      position: 3,
      name: guide.operator,
      item: guideUrl(guide.slug),
    });
  }
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items };
}
