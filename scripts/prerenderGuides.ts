/**
 * Build-time prerender of the /ersattning SEO pages.
 *
 * Runs inside `vite build` (closeBundle hook in vite.config.ts), so it fires
 * no matter how the build is invoked — including Lovable's build pipeline.
 * For each guide it takes the built dist/index.html as template (keeps the
 * hashed asset links), swaps title/meta/canonical/OG, injects page JSON-LD,
 * and writes semantic HTML into <div id="root"> so crawlers see the full
 * content without executing JS. When the SPA boots it renders the matching
 * React route (src/pages/Ersattning*.tsx) over it.
 *
 * Output: dist/ersattning/index.html + dist/ersattning/<slug>/index.html.
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
} from "../src/content/ersattningGuides";

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
`;

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

function bodyHtml(g: Guide): string {
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
        g.faq
          .map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`)
          .join("");
  const official = g.officialUrl
    ? ` · <a href="${esc(g.officialUrl)}" rel="noopener noreferrer">${esc(g.officialLabel ?? "Operatörens formulär")}</a>`
    : "";

  return (
    `<div class="qv-prerender">` +
    `<div class="qv-nav"><a href="/">Qvitta</a><span><a href="/ersattning">Ersättningsguider</a> · <a href="/faq">Vanliga frågor</a></span></div>` +
    `<main>` +
    crumbs +
    `<h1>${esc(g.h1)}</h1>` +
    `<p>${esc(g.lead)}</p>` +
    `<p class="qv-muted">Uppdaterad ${esc(g.updated)}</p>` +
    g.blocks.map(blockHtml).join("") +
    faq +
    `<p><a href="/"><strong>Var ditt tåg försenat? Hitta din avgång på Qvitta</strong></a>${official}</p>` +
    `<p class="qv-muted">Fler guider: ${linkList}</p>` +
    `</main>` +
    `</div>`
  );
}

/** Replace one head tag; throws if the template drifted so we notice at build time. */
function replaceOnce(html: string, pattern: RegExp, replacement: string, what: string): string {
  if (!pattern.test(html)) throw new Error(`prerenderGuides: template is missing ${what}`);
  return html.replace(pattern, replacement);
}

function renderPage(template: string, g: Guide): string {
  const url = guideUrl(g.slug);
  let html = template;

  html = replaceOnce(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(g.metaTitle)}</title>`, "<title>");
  html = replaceOnce(
    html,
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${esc(g.metaDescription)}"`,
    'meta description'
  );
  html = replaceOnce(
    html,
    /<link rel="canonical" href="[^"]*"/,
    `<link rel="canonical" href="${url}"`,
    "canonical"
  );
  html = replaceOnce(
    html,
    /<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${esc(g.metaTitle)}"`,
    "og:title"
  );
  html = replaceOnce(
    html,
    /<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${esc(g.metaDescription)}"`,
    "og:description"
  );
  html = replaceOnce(
    html,
    /<meta property="og:url" content="[^"]*"/,
    `<meta property="og:url" content="${url}"`,
    "og:url"
  );
  html = replaceOnce(
    html,
    /<meta name="twitter:title" content="[^"]*"/,
    `<meta name="twitter:title" content="${esc(g.metaTitle)}"`,
    "twitter:title"
  );
  html = replaceOnce(
    html,
    /<meta name="twitter:description" content="[^"]*"/,
    `<meta name="twitter:description" content="${esc(g.metaDescription)}"`,
    "twitter:description"
  );

  const jsonld = [articleJsonLd(g), breadcrumbJsonLd(g), faqJsonLd(g)]
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
    `<div id="root">${bodyHtml(g)}</div>`,
    '<div id="root"></div>'
  );

  return html;
}

export function prerenderGuidePages(distDir: string): void {
  const templatePath = path.join(distDir, "index.html");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`prerenderGuides: ${templatePath} not found — run after the client build`);
  }
  const template = fs.readFileSync(templatePath, "utf8");

  for (const g of ALL_GUIDE_PAGES) {
    const html = renderPage(template, g);
    const outDir = g.slug
      ? path.join(distDir, "ersattning", g.slug)
      : path.join(distDir, "ersattning");
    fs.mkdirSync(outDir, { recursive: true });
    // Both <route>/index.html and <route>.html: static hosts differ in which
    // they resolve for a slash-less URL (sirv/Netlify try <route>.html first,
    // others only serve directory indexes). Same canonical either way.
    fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
    fs.writeFileSync(`${outDir}.html`, html, "utf8");
  }
  // eslint-disable-next-line no-console
  console.log(`prerenderGuides: wrote ${ALL_GUIDE_PAGES.length} static pages under dist/ersattning/`);
}
