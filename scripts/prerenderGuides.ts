/**
 * Build-time prerender of the SEO pages: /ersattning (+ operator guides) and
 * /forseningar (+ per-station statistics pages), plus dist/sitemap.xml.
 *
 * Runs inside `vite build` (closeBundle hook in vite.config.ts), so it fires
 * no matter how the build is invoked — including Lovable's pipeline. Each page
 * takes the built dist/index.html as template (keeps the hashed asset links),
 * swaps title/meta/canonical/OG, injects page JSON-LD, and writes semantic
 * HTML into <div id="root"> so crawlers see full content without executing
 * JS. When the SPA boots it renders the matching React route over it.
 *
 * Every route is written BOTH as <route>/index.html and <route>.html: static
 * hosts differ in which they resolve for a slash-less URL (sirv/Netlify try
 * <route>.html first, others only serve directory indexes). Same canonical
 * either way.
 */
import fs from "node:fs";
import path from "node:path";
import {
  ALL_GUIDE_PAGES,
  GUIDES,
  type Guide,
  type GuideBlock,
  guideUrl,
  guidePath,
  faqJsonLd,
  articleJsonLd,
  breadcrumbJsonLd,
  SITE,
} from "../src/content/ersattningGuides";
import {
  STATIONS,
  STATIONS_WORST_FIRST,
  STATION_STATS_GENERATED,
  type StationStat,
  stationPath,
  stationUrl,
  stationLiveHref,
  pctOnTime,
  pctLate5,
  pctLate20,
  minutes,
  periodLabel,
  dayLabel,
  operatorDisplay,
  operatorGuideSlug,
} from "../src/content/stationStats";
import {
  OPERATORS,
  OPERATORS_WORST_FIRST,
  OPERATOR_STATS_GENERATED,
  type OperatorStat,
  operatorBySlug,
  operatorPath,
  operatorUrl,
} from "../src/content/operatorStats";
import { FAQ_ITEMS, faqPageJsonLd } from "../src/content/faq";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Minimal styling so the static HTML is readable before React mounts.
   Scoped under .qv-prerender; React replaces the whole root on mount. */
const PRERENDER_CSS = `
.qv-prerender{max-width:760px;margin:0 auto;padding:2rem 1.25rem 4rem;font-family:"Schibsted Grotesk",system-ui,sans-serif;color:#1c2b27;line-height:1.6}
.qv-prerender a{color:#0E8C7E}
.qv-prerender h1{font-size:1.9rem;line-height:1.15;letter-spacing:-.02em;margin:.5rem 0}
.qv-prerender h2{font-size:1.3rem;margin:2rem 0 .6rem}
.qv-prerender table{border-collapse:collapse;width:100%;margin:0 0 1rem}
.qv-prerender th,.qv-prerender td{border:1px solid #dfe7e4;padding:.55rem .75rem;text-align:left;font-size:.95rem}
.qv-prerender .qv-muted{color:#5c6f6a;font-size:.85rem}
.qv-prerender .qv-nav{display:flex;justify-content:space-between;align-items:center;padding:.5rem 0 1.5rem;border-bottom:1px solid #dfe7e4;margin-bottom:1.5rem}
.qv-prerender .qv-nav a{text-decoration:none;font-weight:700}
.qv-prerender ul{padding-left:1.2rem}
.qv-prerender li{margin:.3rem 0}
.qv-prerender .qv-btn{display:inline-block;padding:.6rem 1.1rem;border:1px solid #0E8C7E;border-radius:.6rem;text-decoration:none;font-weight:700;margin:0 .5rem .5rem 0}
.qv-prerender .qv-btn--accent{background:#0E8C7E;color:#fff}
`;

/* ------------------------------------------------------------------ */
/* Generic page assembly                                               */
/* ------------------------------------------------------------------ */

type SeoPage = {
  /** Route path, e.g. "/ersattning/sj" or "/forseningar/lund-c". */
  routePath: string;
  url: string;
  metaTitle: string;
  metaDescription: string;
  jsonld: object[];
  /** Inner HTML for <main> (the qv-nav shell is added around it). */
  mainHtml: string;
};

function shellHtml(mainHtml: string): string {
  return (
    `<div class="qv-prerender">` +
    `<div class="qv-nav"><a href="/">Qvitta</a><span>` +
    `<a href="/ersattning">Ersättningsguider</a> · ` +
    `<a href="/forseningar">Förseningsstatistik</a> · ` +
    `<a href="/faq">Vanliga frågor</a></span></div>` +
    `<main>${mainHtml}</main>` +
    `</div>`
  );
}

/** Replace one head tag; throws if the template drifted so we notice at build time. */
function replaceOnce(html: string, pattern: RegExp, replacement: string, what: string): string {
  if (!pattern.test(html)) throw new Error(`prerenderGuides: template is missing ${what}`);
  return html.replace(pattern, replacement);
}

function renderSeoPage(template: string, p: SeoPage): string {
  let html = template;

  html = replaceOnce(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(p.metaTitle)}</title>`, "<title>");
  html = replaceOnce(
    html,
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${esc(p.metaDescription)}"`,
    "meta description"
  );
  html = replaceOnce(
    html,
    /<link rel="canonical" href="[^"]*"/,
    `<link rel="canonical" href="${p.url}"`,
    "canonical"
  );
  html = replaceOnce(
    html,
    /<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${esc(p.metaTitle)}"`,
    "og:title"
  );
  html = replaceOnce(
    html,
    /<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${esc(p.metaDescription)}"`,
    "og:description"
  );
  html = replaceOnce(
    html,
    /<meta property="og:url" content="[^"]*"/,
    `<meta property="og:url" content="${p.url}"`,
    "og:url"
  );
  html = replaceOnce(
    html,
    /<meta name="twitter:title" content="[^"]*"/,
    `<meta name="twitter:title" content="${esc(p.metaTitle)}"`,
    "twitter:title"
  );
  html = replaceOnce(
    html,
    /<meta name="twitter:description" content="[^"]*"/,
    `<meta name="twitter:description" content="${esc(p.metaDescription)}"`,
    "twitter:description"
  );

  const jsonld = p.jsonld
    .map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`)
    .join("\n");
  html = replaceOnce(
    html,
    /<\/head>/,
    `<style>${PRERENDER_CSS}</style>\n${jsonld}\n</head>`,
    "</head>"
  );

  html = replaceOnce(
    html,
    /<div id="root"><\/div>/,
    `<div id="root">${shellHtml(p.mainHtml)}</div>`,
    '<div id="root"></div>'
  );

  return html;
}

function writePage(distDir: string, routePath: string, html: string): void {
  // "/ersattning/sj" -> dist/ersattning/sj/index.html + dist/ersattning/sj.html
  const rel = routePath.replace(/^\//, "");
  const outDir = path.join(distDir, ...rel.split("/"));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
  fs.writeFileSync(`${outDir}.html`, html, "utf8");
}

/* ------------------------------------------------------------------ */
/* /ersattning guide pages                                             */
/* ------------------------------------------------------------------ */

function blockHtml(b: GuideBlock): string {
  switch (b.t) {
    case "h2":
      return `<h2>${esc(b.text)}</h2>`;
    case "p":
      return `<p>${esc(b.text)}</p>`;
    case "ul":
      return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    case "table":
      return (
        `<table><thead><tr>${b.header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` +
        `<tbody>${b.rows
          .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`
      );
  }
}

/**
 * The "Ansök här" button pair — mirrors GuideCtaButtons in
 * src/components/daylight/GuideContent.tsx (keep the two in sync).
 */
function guideCtaHtml(g: Guide): string {
  const qvitta = (primary: boolean) =>
    `<a class="qv-btn${primary ? " qv-btn--accent" : ""}" href="/">${
      primary
        ? g.inAppFiling
          ? "Ansök via Qvitta — vi skickar in åt dig"
          : "Sök din försenade avgång — ansök direkt"
        : "Hitta din försening på Qvitta"
    }</a>`;
  const official = (primary: boolean) =>
    g.officialUrl
      ? `<a class="qv-btn${primary ? " qv-btn--accent" : ""}" href="${esc(g.officialUrl)}" rel="noopener noreferrer">${
          primary ? esc(`Ansök här — hos ${g.operator}`) : esc(g.officialLabel ?? "Operatörens formulär")
        }</a>`
      : "";
  const pair = g.inAppFiling
    ? qvitta(true) + official(false)
    : g.officialUrl
      ? official(true) + qvitta(false)
      : qvitta(true);
  return `<p>${pair}</p>`;
}

function guideMainHtml(g: Guide): string {
  const crumbs = g.slug
    ? `<nav aria-label="Brödsmulor"><a href="/ersattning">Förseningsersättning</a> / ${esc(g.operator)}</nav>`
    : "";
  const linkList = GUIDES.filter((x) => x.slug !== g.slug)
    .map((x) => `<a href="${guidePath(x.slug)}">${esc(x.operator)}</a>`)
    .join(" · ");
  const faq =
    g.faq.length === 0
      ? ""
      : `<h2>Vanliga frågor</h2>` +
        g.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("");

  return (
    crumbs +
    `<h1>${esc(g.h1)}</h1>` +
    `<p>${esc(g.lead)}</p>` +
    `<p class="qv-muted">Uppdaterad ${esc(g.updated)}</p>` +
    guideCtaHtml(g) +
    (operatorBySlug(g.slug)
      ? `<p><a href="/forseningar/tag/${g.slug}">Hur försenade är ${esc(g.operator)}s tåg just nu? Se statistiken →</a></p>`
      : "") +
    g.blocks.map(blockHtml).join("") +
    faq +
    `<h2>Ansök om ersättning</h2>` +
    `<p>Var ditt tåg försenat? Sök din sträcka så ser du direkt om du har rätt till ersättning.</p>` +
    guideCtaHtml(g) +
    `<p class="qv-muted">Fler guider: ${linkList}</p>`
  );
}

const guidePage = (g: Guide): SeoPage => ({
  routePath: guidePath(g.slug),
  url: guideUrl(g.slug),
  metaTitle: g.metaTitle,
  metaDescription: g.metaDescription,
  jsonld: [articleJsonLd(g), breadcrumbJsonLd(g), faqJsonLd(g)],
  mainHtml: guideMainHtml(g),
});

/* ------------------------------------------------------------------ */
/* /forseningar station pages                                          */
/* ------------------------------------------------------------------ */

function stationBreadcrumbJsonLd(s: StationStat): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Qvitta", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Tågförseningar", item: `${SITE}/forseningar` },
      { "@type": "ListItem", position: 3, name: s.station_name, item: stationUrl(s) },
    ],
  };
}

function stationMainHtml(s: StationStat): string {
  const operator = operatorDisplay(s.operator_label);
  const guideSlug = operatorGuideSlug(s);
  const period = periodLabel(s);
  const top = STATIONS_WORST_FIRST.slice(0, 10).filter((x) => x.slug !== s.slug).slice(0, 8);

  const rows: [string, string][] = [
    ["Avgångar under perioden", String(s.n_departures)],
    ["I tid (mindre än 5 min sena)", `${pctOnTime(s)} %`],
    ["Försenade ≥ 5 minuter", `${s.n_late_5} (${pctLate5(s)} %)`],
    ["Försenade ≥ 20 minuter (kan ge ersättning)", `${s.n_late_20} (${pctLate20(s)} %)`],
    ["Inställda avgångar", String(s.n_cancelled)],
    ["Genomsnittlig försening", `${minutes(s.avg_delay_seconds)} min`],
    ["Största försening", `${minutes(s.max_delay_seconds)} min`],
  ];

  const daysTable =
    s.days && s.days.length > 0
      ? `<h2>Dag för dag i ${esc(period)}</h2>` +
        `<table><thead><tr><th>Dag</th><th>Avgångar</th><th>≥ 20 min sena</th><th>Inställda</th><th>Största försening</th></tr></thead>` +
        `<tbody>${s.days
          .map(
            (d) =>
              `<tr><td>${esc(dayLabel(d.d))}</td><td>${d.dep}</td><td>${d.l20}</td><td>${d.canc}</td><td>${esc(minutes(d.mx))} min</td></tr>`
          )
          .join("")}</tbody></table>` +
        `<h2>Hela perioden</h2>`
      : "";

  return (
    `<nav aria-label="Brödsmulor"><a href="/forseningar">Tågförseningar</a> / ${esc(s.station_name)}</nav>` +
    `<h1>Tågförseningar ${esc(s.station_name)}</h1>` +
    `<p>Under perioden ${esc(period)} avgick ${s.n_departures} tåg från ${esc(s.station_name)}` +
    (operator ? ` (främst ${esc(operator)})` : "") +
    `. ${pctOnTime(s)} % gick i tid, ${s.n_late_20} avgångar var minst 20 minuter försenade och ${s.n_cancelled} ställdes in.</p>` +
    `<p><a class="qv-btn qv-btn--accent" rel="nofollow" href="${esc(stationLiveHref(s))}">Se dagens avgångar från ${esc(s.station_name)} — live</a></p>` +
    daysTable +
    `<table><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table>` +
    `<h2>Försenad från ${esc(s.station_name)}? Så får du ersättning</h2>` +
    `<p>En försening på 20 minuter ger i de flesta fall rätt till 50 % av biljettpriset tillbaka — 100 % vid en timme. ` +
    `<a rel="nofollow" href="${esc(stationLiveHref(s))}"><strong>Sök din avgång på Qvitta</strong></a> så ser du direkt om den ger rätt till ersättning. ` +
    `Läs mer i <a href="/ersattning">ersättningsguiden</a>` +
    (guideSlug && operator ? ` eller guiden för <a href="/ersattning/${guideSlug}">${esc(operator)}</a>` : "") +
    `.</p>` +
    `<h2>Mest försenade stationerna just nu</h2>` +
    `<p>${top.map((x) => `<a href="${stationPath(x)}">${esc(x.station_name)}</a>`).join(" · ")} · <a href="/forseningar">Alla stationer</a></p>` +
    `<p class="qv-muted">Statistiken bygger på Trafikverkets realtidsdata för uppmätta avgångar och uppdateras månadsvis. Period: ${esc(period)}.</p>`
  );
}

const stationPage = (s: StationStat): SeoPage => ({
  routePath: stationPath(s),
  url: stationUrl(s),
  metaTitle: `Tågförseningar ${s.station_name} — statistik & ersättning | Qvitta`,
  metaDescription: `${periodLabel(s)}: ${s.n_departures} avgångar från ${s.station_name}, ${s.n_late_20} minst 20 minuter försenade och ${s.n_cancelled} inställda. Se statistiken och ansök om ersättning.`,
  jsonld: [stationBreadcrumbJsonLd(s)],
  mainHtml: stationMainHtml(s),
});

/* ------------------------------------------------------------------ */
/* /forseningar/tag/<operator> pages                                    */
/* ------------------------------------------------------------------ */

function operatorBreadcrumbJsonLd(o: OperatorStat): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Qvitta", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Tågförseningar", item: `${SITE}/forseningar` },
      { "@type": "ListItem", position: 3, name: o.name, item: operatorUrl(o) },
    ],
  };
}

function operatorMainHtml(o: OperatorStat): string {
  const period = periodLabel(o);
  const worstStations = STATIONS.filter((s) => operatorGuideSlug(s) === o.slug)
    .sort((a, b) => b.n_late_20 - a.n_late_20)
    .slice(0, 8);
  const others = OPERATORS_WORST_FIRST.filter((x) => x.slug !== o.slug).slice(0, 8);

  const rows: [string, string][] = [
    ["Tåg under perioden", String(o.n_trains)],
    ["I tid (aldrig mer än 5 min sena)", `${pctOnTime(o)} %`],
    ["Försenade ≥ 5 minuter", `${o.n_late_5} (${pctLate5(o)} %)`],
    ["Försenade ≥ 20 minuter (kan ge ersättning)", `${o.n_late_20} (${pctLate20(o)} %)`],
    ["Inställda tåg", String(o.n_cancelled)],
    ["Genomsnittlig försening per uppmätt tåg", `${minutes(o.avg_delay_seconds)} min`],
    ["Största försening", `${minutes(o.max_delay_seconds)} min`],
  ];

  const daysTable =
    o.days.length > 0
      ? `<h2>Dag för dag i ${esc(period)}</h2>` +
        `<table><thead><tr><th>Dag</th><th>Tåg</th><th>≥ 20 min sena</th><th>Inställda</th><th>Största försening</th></tr></thead>` +
        `<tbody>${o.days
          .map(
            (d) =>
              `<tr><td>${esc(dayLabel(d.d))}</td><td>${d.tr}</td><td>${d.l20}</td><td>${d.canc}</td><td>${esc(minutes(d.mx))} min</td></tr>`
          )
          .join("")}</tbody></table>` +
        `<h2>Hela perioden</h2>`
      : "";

  return (
    `<nav aria-label="Brödsmulor"><a href="/forseningar">Tågförseningar</a> / ${esc(o.name)}</nav>` +
    `<h1>${esc(o.name)} förseningar — så sena är tågen</h1>` +
    `<p>Under perioden ${esc(period)} körde ${esc(o.name)} ${o.n_trains} tåg i vår mätning. ` +
    `${pctOnTime(o)} % gick i tid hela vägen, ${o.n_late_20} tåg var minst 20 minuter försenade ` +
    `någonstans längs rutten och ${o.n_cancelled} ställdes in.</p>` +
    `<p><a class="qv-btn qv-btn--accent" href="/#board">Se dagens avgångar live</a></p>` +
    daysTable +
    `<table><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table>` +
    `<h2>Försenad med ${esc(o.name)}? Så får du ersättning</h2>` +
    `<p>En försening på 20 minuter ger i de flesta fall rätt till 50 % av biljettpriset tillbaka — 100 % vid en timme. ` +
    `<a href="/#board"><strong>Sök din avgång på Qvitta</strong></a> så ser du direkt om den ger rätt till ersättning. ` +
    `Helt gratis — ingen provision, hela ersättningen går till dig. ` +
    `Läs mer i <a href="/ersattning/${o.slug}">guiden för ersättning hos ${esc(o.name)}</a>.</p>` +
    (worstStations.length > 0
      ? `<h2>Mest försenade stationerna där ${esc(o.name)} dominerar</h2>` +
        `<p>${worstStations.map((s) => `<a href="${stationPath(s)}">${esc(s.station_name)}</a>`).join(" · ")}</p>`
      : "") +
    `<h2>Fler tågbolag</h2>` +
    `<p>${others.map((x) => `<a href="${operatorPath(x)}">${esc(x.name)}</a>`).join(" · ")} · <a href="/forseningar">Alla stationer</a></p>` +
    `<p class="qv-muted">Statistiken bygger på Trafikverkets realtidsdata. Ett tåg räknas som försenat om det var minst 5 (respektive 20) minuter sent vid någon uppmätt station längs rutten, och räknas till det bolag som Trafikverket märkt tåget med — märkningen kan skifta där bolag delar spår. Period: ${esc(period)}.</p>`
  );
}

const operatorPage = (o: OperatorStat): SeoPage => ({
  routePath: operatorPath(o),
  url: operatorUrl(o),
  metaTitle: `${o.name} förseningar — statistik & ersättning | Qvitta`,
  metaDescription: `Hur försenade är ${o.name}s tåg? ${periodLabel(o)}: ${o.n_late_20} av ${o.n_measured} uppmätta tåg var minst 20 minuter sena och ${o.n_cancelled} ställdes in. Se statistiken och ansök om ersättning gratis.`,
  jsonld: [operatorBreadcrumbJsonLd(o)],
  mainHtml: operatorMainHtml(o),
});

function stationIndexPage(): SeoPage {
  const period = STATIONS[0] ? periodLabel(STATIONS[0]) : "";
  const rows = STATIONS_WORST_FIRST.map(
    (s) =>
      `<tr><td><a href="${stationPath(s)}">${esc(s.station_name)}</a></td>` +
      `<td>${s.n_departures}</td><td>${s.n_late_20}</td><td>${pctLate20(s)} %</td><td>${s.n_cancelled}</td></tr>`
  ).join("");

  return {
    routePath: "/forseningar",
    url: `${SITE}/forseningar`,
    metaTitle: "Tågförseningar i Sverige — statistik per station | Qvitta",
    metaDescription: `Hur ofta är tågen försenade från din station? Statistik för ${STATIONS.length} svenska stationer baserad på Trafikverkets realtidsdata — och hur du får ersättning.`,
    jsonld: [],
    mainHtml:
      `<h1>Tågförseningar i Sverige — statistik per station</h1>` +
      `<p>Vi mäter varje avgång från ${STATIONS.length} stationer med Trafikverkets realtidsdata. ` +
      `Här ser du hur ofta tågen faktiskt är sena från din station — och en försening på 20 minuter ger ofta ` +
      `<a href="/ersattning">rätt till ersättning</a>.</p>` +
      `<p class="qv-muted">Period: ${esc(period)}. Sorterat efter antal ersättningsgrundande förseningar (≥ 20 min).</p>` +
      (OPERATORS_WORST_FIRST.length > 0
        ? `<h2>Förseningar per tågbolag</h2>` +
          `<p>${OPERATORS_WORST_FIRST.map((o) => `<a href="${operatorPath(o)}">${esc(o.name)}</a>`).join(" · ")}</p>`
        : "") +
      `<table><thead><tr><th>Station</th><th>Avgångar</th><th>≥ 20 min sena</th><th>Andel ≥ 20 min</th><th>Inställda</th></tr></thead>` +
      `<tbody>${rows}</tbody></table>`,
  };
}

/* ------------------------------------------------------------------ */
/* /faq                                                                */
/* ------------------------------------------------------------------ */

function faqPage(): SeoPage {
  return {
    routePath: "/faq",
    url: `${SITE}/faq`,
    metaTitle: "Vanliga frågor — Qvitta",
    metaDescription: "Vanliga frågor och svar om ersättning för försenade och inställda tåg.",
    jsonld: [faqPageJsonLd()],
    mainHtml:
      `<h1>Vanliga frågor</h1>` +
      `<p>Svar på de vanligaste frågorna om ersättning för försenade och inställda tåg — och om hur Qvitta fungerar.</p>` +
      FAQ_ITEMS.map((f) => `<h2>${esc(f.q)}</h2><p>${esc(f.a)}</p>`).join("") +
      `<p>Hittade du inte svaret? Läs <a href="/ersattning">ersättningsguiden</a> eller mejla <a href="mailto:kontakt@qvitta.nu">kontakt@qvitta.nu</a>.</p>`,
  };
}

/* ------------------------------------------------------------------ */
/* / (homepage) — crawlable content + the internal-link hub            */
/* ------------------------------------------------------------------ */

/**
 * The homepage is the SPA itself, so we don't create a separate route file —
 * we enrich dist/index.html's #root with static content (React renders the
 * live board over it on mount). This is what gives crawlers text on the most
 * linked page AND no-JS internal links into /ersattning + /forseningar, so
 * link equity actually flows from / to the SEO pages.
 */
function homePage(): SeoPage {
  const topStations = STATIONS_WORST_FIRST.slice(0, 20);
  return {
    routePath: "/",
    url: `${SITE}/`,
    // Same title/meta as the template — the swap is a no-op, but keeps one code path.
    metaTitle: "Ersättning för försenade tåg — Qvitta",
    metaDescription:
      "Försenat eller inställt tåg? Sök din avgång, se direkt om den ger rätt till förseningsersättning och ansök hos rätt operatör – gratis.",
    jsonld: [],
    mainHtml:
      `<h1>En samlad plats för alla tågförseningar och ersättningsanspråk — gratis</h1>` +
      `<p>Qvitta bevakar tågtrafiken i hela Sverige i realtid med data från Trafikverket. ` +
      `Sök din sträcka, se vilka avgångar som var försenade eller inställda, och ansök om ` +
      `ersättning hos rätt operatör — vi hjälper dig hela vägen, utan att röra dina pengar.</p>` +
      `<h2>Så funkar det</h2>` +
      `<ul>` +
      `<li>Sök station och datum — vi visar varje avgång med faktisk försening.</li>` +
      `<li>En försening på 20 minuter ger ofta rätt till 50–100 % av biljettpriset tillbaka.</li>` +
      `<li>Vi fyller i och skickar ansökan där det går, och pekar dig till rätt formulär annars.</li>` +
      `</ul>` +
      `<h2>Förseningsersättning per operatör</h2>` +
      `<p><a href="/ersattning"><strong>Så får du pengar tillbaka för försenade tåg — hela guiden</strong></a></p>` +
      `<p>${GUIDES.map((g) => `<a href="${guidePath(g.slug)}">${esc(g.operator)}</a>`).join(" · ")}</p>` +
      `<h2>Tågförseningar per station</h2>` +
      `<p>Statistik för ${STATIONS.length} stationer: <a href="/forseningar"><strong>hur ofta är tågen sena från din station?</strong></a></p>` +
      `<p>${topStations.map((s) => `<a href="${stationPath(s)}">${esc(s.station_name)}</a>`).join(" · ")}</p>` +
      `<p><a href="/faq">Vanliga frågor</a> · <a href="/integritet">Integritetspolicy</a></p>`,
  };
}

/* ------------------------------------------------------------------ */
/* sitemap.xml                                                         */
/* ------------------------------------------------------------------ */

/**
 * How many station pages the sitemap submits (of the ~390 we prerender).
 *
 * Googlebot spends ~0.7 DISCOVERY requests/day on this site (GSC crawl stats
 * 2026-07-26: 471 requests / 90 days, 14 % discovery, 42 % of the budget eaten
 * by JS). Submitting every station spreads a starvation-level budget across
 * URLs Google won't reach for a year — measured result: ~50 of 392 indexed,
 * 6 impressions total. So we submit only the busiest stations (where the
 * search demand is) and let the rest be found via /forseningar, which still
 * links all of them. Raise this as crawl rate grows — it's gated on backlinks,
 * not on page count.
 */
const SITEMAP_STATION_LIMIT = 60;

/**
 * Stations that are submitted regardless of departure volume.
 *
 * Departure volume alone is a BAD proxy for search demand: it ranks by service
 * frequency, so a pendeltåg stop like Örtofta or Norrviken outranks Uppsala C.
 * People search for the place, not the timetable. This list is the county seats
 * / major rail cities inside our coverage; volume fills the remaining slots.
 * (Umeå, Sundsvall, Östersund, Luleå, Falun/Borlänge and Visby are absent
 * because we don't poll northern Sweden — see the CLAUDE.md §15 exclusion
 * register, not an oversight here.)
 */
const SITEMAP_PRIORITY_STATIONS = [
  "stockholm-c", "goteborg-c", "malmo-c", "lund-c", "uppsala-c", "helsingborg-c",
  "linkoping-c", "norrkoping-c", "vasteras-c", "orebro-c", "jonkoping-c", "gavle-c",
  "karlstad-c", "eskilstuna-c", "halmstad-c", "kristianstad-c", "vaxjo", "kalmar-c",
  "karlskrona-c", "boras-c", "skovde-c", "varberg-c", "trollhattan", "molndal",
  "landskrona", "nykoping-c", "katrineholm-c", "hassleholm", "alvesta", "nassjo-c",
  "hallsberg", "mjolby", "ystad", "trelleborg",
];

function sitemapXml(): string {
  const pillarLastmod = ALL_GUIDE_PAGES[0]?.updated;
  const byVolume = [...STATIONS].sort((a, b) => b.n_departures - a.n_departures);
  const priority = SITEMAP_PRIORITY_STATIONS.map((slug) =>
    STATIONS.find((s) => s.slug === slug)
  ).filter((s): s is StationStat => s !== undefined);
  // Priority cities first, then the busiest remaining stations up to the cap.
  const picked = new Set(priority.map((s) => s.slug));
  const sitemapStations = [...priority];
  for (const s of byVolume) {
    if (sitemapStations.length >= SITEMAP_STATION_LIMIT) break;
    if (!picked.has(s.slug)) {
      picked.add(s.slug);
      sitemapStations.push(s);
    }
  }
  const urls: { loc: string; changefreq: string; priority: string; lastmod?: string }[] = [
    { loc: `${SITE}/`, changefreq: "daily", priority: "1.0" },
    { loc: `${SITE}/ersattning`, changefreq: "monthly", priority: "0.9", lastmod: pillarLastmod },
    ...GUIDES.map((g) => ({ loc: guideUrl(g.slug), changefreq: "monthly", priority: "0.8", lastmod: g.updated })),
    { loc: `${SITE}/forseningar`, changefreq: "daily", priority: "0.8", lastmod: STATION_STATS_GENERATED },
    ...OPERATORS.map((o) => ({ loc: operatorUrl(o), changefreq: "weekly", priority: "0.7", lastmod: OPERATOR_STATS_GENERATED })),
    ...sitemapStations.map((s) => ({ loc: stationUrl(s), changefreq: "weekly", priority: "0.6", lastmod: STATION_STATS_GENERATED })),
    { loc: `${SITE}/faq`, changefreq: "monthly", priority: "0.7" },
    // /genvag and /integritet are deliberately NOT submitted: they have no
    // prerender entry (see prerenderSeoPages), so they serve the SPA shell,
    // which canonicals to "/" — submitting them just files them under
    // "Alternate page with proper canonical tag" and burns crawl budget.
    // If /genvag should ever rank, give it a real SeoPage first, then re-add.
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>\n` +
          (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : "") +
          `    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
      )
      .join("\n") +
    `\n</urlset>\n`
  );
}

/* ------------------------------------------------------------------ */
/* Entry point (called from vite.config.ts closeBundle)                */
/* ------------------------------------------------------------------ */

export function prerenderSeoPages(distDir: string): void {
  const templatePath = path.join(distDir, "index.html");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`prerenderGuides: ${templatePath} not found — run after the client build`);
  }
  const template = fs.readFileSync(templatePath, "utf8");

  const pages: SeoPage[] = [
    ...ALL_GUIDE_PAGES.map(guidePage),
    stationIndexPage(),
    ...OPERATORS.map(operatorPage),
    ...STATIONS.map(stationPage),
    faqPage(),
  ];
  for (const p of pages) {
    writePage(distDir, p.routePath, renderSeoPage(template, p));
  }

  // The homepage: enrich dist/index.html itself (no separate route). Rendered
  // from the pristine `template` string, so ordering vs the loop is irrelevant.
  // NOTE: index.html is also the SPA fallback for client routes — React
  // replaces #root on mount, so the static content only ever flashes briefly.
  fs.writeFileSync(templatePath, renderSeoPage(template, homePage()), "utf8");

  // sitemap.xml is generated here (single source of truth: the same data that
  // decides which pages exist) — it overwrites the public/ copy if one exists.
  fs.writeFileSync(path.join(distDir, "sitemap.xml"), sitemapXml(), "utf8");

  // eslint-disable-next-line no-console
  console.log(
    `prerenderGuides: wrote ${pages.length} static pages (${ALL_GUIDE_PAGES.length} guides, ${OPERATORS.length} operator pages, ${STATIONS.length + 1} station pages) + sitemap.xml`
  );
}
