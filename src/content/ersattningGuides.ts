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
  /** ISO date shown as "Uppdaterad" and used in Article JSON-LD. */
  updated: string;
};

const UPDATED = "2026-07-07";

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
  metaTitle: "Förseningsersättning för tåg — så får du pengar tillbaka | Qvitta",
  metaDescription:
    "Försenat eller inställt tåg? Vid 20 minuters försening har du ofta rätt till 50–100 % av biljettpriset. Guide till reglerna, beloppen och hur du ansöker — per operatör.",
  h1: "Förseningsersättning för tåg — så får du pengar tillbaka",
  lead:
    "När tåget är mer än 20 minuter försenat har du i de flesta fall laglig rätt till ersättning — men bara om du ansöker. Här är reglerna, beloppen och fristerna, samlade på ett ställe.",
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
  updated: UPDATED,
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
      { t: "h2", text: "Så ansöker du hos SJ" },
      {
        t: "ul",
        items: [
          "Ansökan görs i SJ:s webbformulär utan inloggning — du behöver bara bokningsnumret (8 eller 12 tecken) och den e-postadress eller det mobilnummer som användes vid köpet.",
          "Ersättningen för själva förseningen betalas tillbaka till det betalsätt du använde vid köpet.",
          "Merkostnader — taxi, hotell, mat vid längre förseningar — söks i samma formulär men kräver kvitton och betalas ut separat.",
          "Varje bokning kan bara användas för en ansökan; har du redan ansökt får du beskedet direkt.",
        ],
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
    ],
    officialUrl: "https://www.sj.se/om-sj/regler-och-villkor/rattigheter-vid-forsening",
    officialLabel: "SJ: rättigheter vid försening",
    updated: UPDATED,
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
