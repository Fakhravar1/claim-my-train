import { Helmet } from "react-helmet-async";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { Nav, Footer } from "@/components/daylight/shell";
import { PILLAR, faqJsonLd, articleJsonLd, breadcrumbJsonLd, guideUrl } from "@/content/ersattningGuides";
import { GuideBlocks, GuideFaqList, GuideLinkList, GuideCta } from "@/components/daylight/GuideContent";

/**
 * /ersattning — the SEO pillar page ("förseningsersättning tåg" etc.) and hub
 * linking every operator guide. Content lives in src/content/ersattningGuides.ts
 * and is also prerendered to static HTML at build time (scripts/prerenderGuides.ts).
 */
export default function Ersattning() {
  useDaylightStyles();
  const g = PILLAR;

  return (
    <div className="cmt-daylight">
      <Helmet>
        <title>{g.metaTitle}</title>
        <meta name="description" content={g.metaDescription} />
        <link rel="canonical" href={guideUrl(g.slug)} />
        <script type="application/ld+json">{JSON.stringify(articleJsonLd(g))}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbJsonLd(g))}</script>
        <script type="application/ld+json">{JSON.stringify(faqJsonLd(g))}</script>
      </Helmet>

      <Nav signedIn={false} accountLabel="" onSignOut={() => {}} onLogin={() => {}} />

      <main className="wrap" style={{ paddingTop: "2.5rem", paddingBottom: "4rem", maxWidth: 760 }}>
        <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 .5rem", lineHeight: 1.15 }}>
          {g.h1}
        </h1>
        <p className="lead" style={{ margin: "0 0 1.2rem", fontSize: "1.05rem", color: "var(--ink-2)", lineHeight: 1.55 }}>
          {g.lead}
        </p>
        <p style={{ margin: "0 0 1.5rem", fontSize: ".85rem", color: "var(--muted)" }}>
          Uppdaterad {g.updated}
        </p>

        <GuideLinkList />
        <GuideBlocks blocks={g.blocks} />
        <GuideFaqList guide={g} />
        <GuideCta guide={g} />
      </main>

      <Footer />
    </div>
  );
}
