import { Helmet } from "react-helmet-async";
import { Link, Navigate, useParams } from "react-router-dom";
import { useDaylightStyles } from "@/hooks/useDaylightStyles";
import { Nav, Footer } from "@/components/daylight/shell";
import { GUIDES, faqJsonLd, articleJsonLd, breadcrumbJsonLd, guideUrl } from "@/content/ersattningGuides";
import { GuideBlocks, GuideFaqList, GuideLinkList, GuideCta } from "@/components/daylight/GuideContent";

/**
 * /ersattning/:slug — per-operator förseningsersättning guide (SJ, SL,
 * Skånetrafiken, ...). Content lives in src/content/ersattningGuides.ts and is
 * also prerendered to static HTML at build time (scripts/prerenderGuides.ts).
 */
export default function ErsattningGuide() {
  useDaylightStyles();
  const { slug } = useParams<{ slug: string }>();
  const g = GUIDES.find((guide) => guide.slug === slug);

  if (!g) return <Navigate to="/ersattning" replace />;

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
        <nav aria-label="Brödsmulor" style={{ fontSize: ".88rem", color: "var(--muted)", marginBottom: "1rem" }}>
          <Link to="/ersattning" style={{ color: "var(--accent)", textDecoration: "none" }}>
            Förseningsersättning
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{g.operator}</span>
        </nav>

        <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 .5rem", lineHeight: 1.15 }}>
          {g.h1}
        </h1>
        <p className="lead" style={{ margin: "0 0 1.2rem", fontSize: "1.05rem", color: "var(--ink-2)", lineHeight: 1.55 }}>
          {g.lead}
        </p>
        <p style={{ margin: "0 0 1.5rem", fontSize: ".85rem", color: "var(--muted)" }}>
          Uppdaterad {g.updated}
        </p>

        <GuideBlocks blocks={g.blocks} />
        <GuideFaqList guide={g} />
        <GuideCta guide={g} />
        <GuideLinkList current={g.slug} />
      </main>

      <Footer />
    </div>
  );
}
