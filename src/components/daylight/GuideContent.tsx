import { Link } from "react-router-dom";
import type { Guide, GuideBlock } from "@/content/ersattningGuides";
import { GUIDES, guidePath } from "@/content/ersattningGuides";

/**
 * Shared renderers for the /ersattning SEO guide pages. The same content data
 * is rendered to static HTML at build time by scripts/prerenderGuides.ts —
 * keep the visible structure here in sync with that generator (h2/p/ul/table
 * + FAQ as <details>), so the crawler-visible page and the hydrated page say
 * the same thing.
 */

const tableCell: React.CSSProperties = {
  border: "1px solid var(--line)",
  padding: ".6rem .8rem",
  textAlign: "left",
  fontSize: ".95rem",
  lineHeight: 1.45,
};

export function GuideBlocks({ blocks }: { blocks: GuideBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h2":
            return (
              <h2 key={i} style={{ fontSize: "1.3rem", fontWeight: 700, letterSpacing: "-0.015em", margin: "2.2rem 0 .7rem" }}>
                {b.text}
              </h2>
            );
          case "p":
            return (
              <p key={i} style={{ margin: "0 0 1rem", color: "var(--ink-2)", lineHeight: 1.65, fontSize: ".98rem" }}>
                {b.text}
              </p>
            );
          case "ul":
            return (
              <ul key={i} style={{ margin: "0 0 1rem", paddingLeft: "1.2rem", color: "var(--ink-2)", lineHeight: 1.65, fontSize: ".98rem", display: "grid", gap: ".45rem" }}>
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={i} style={{ overflowX: "auto", margin: "0 0 1rem" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", background: "var(--card-bg)" }}>
                  <thead>
                    <tr>
                      {b.header.map((h, j) => (
                        <th key={j} style={{ ...tableCell, fontWeight: 700, background: "var(--bg-2, transparent)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td key={k} style={tableCell}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}

export function GuideFaqList({ guide }: { guide: Guide }) {
  if (guide.faq.length === 0) return null;
  return (
    <>
      <h2 style={{ fontSize: "1.3rem", fontWeight: 700, letterSpacing: "-0.015em", margin: "2.2rem 0 .9rem" }}>
        Vanliga frågor
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: ".7rem" }}>
        {guide.faq.map((f, i) => (
          <details key={i} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--card-bg)", overflow: "hidden" }}>
            <summary style={{ padding: ".95rem 1.15rem", fontWeight: 600, fontSize: ".98rem", cursor: "pointer", listStyle: "none", color: "var(--card-text)" }}>
              {f.q}
            </summary>
            <div style={{ padding: "0 1.15rem .95rem", color: "var(--card-muted)", fontSize: ".95rem", lineHeight: 1.6 }}>
              {f.a}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}

/** "Fler guider" cross-links — the internal-link mesh between the guide pages. */
export function GuideLinkList({ current }: { current?: string }) {
  const others = GUIDES.filter((g) => g.slug !== current);
  if (others.length === 0) return null;
  return (
    <div style={{ marginTop: "2.2rem" }}>
      <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 .7rem" }}>
        {current ? "Guider för fler operatörer" : "Guider per operatör"}
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
        {others.map((g) => (
          <Link
            key={g.slug}
            to={guidePath(g.slug)}
            className="btn"
            style={{ fontSize: ".92rem" }}
          >
            {g.operator}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** CTA band: into the app + to the operator's own form. */
export function GuideCta({ guide }: { guide: Guide }) {
  return (
    <div
      style={{
        marginTop: "2.2rem",
        padding: "1.2rem 1.3rem",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-lg)",
        background: "var(--card-bg)",
        display: "flex",
        flexDirection: "column",
        gap: ".8rem",
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, color: "var(--card-text)" }}>
        Var ditt tåg försenat? Sök din sträcka så ser du direkt om du har rätt till ersättning.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem" }}>
        <Link to="/" className="btn btn--accent">
          Hitta din försening
        </Link>
        {guide.officialUrl && (
          <a href={guide.officialUrl} target="_blank" rel="noopener noreferrer" className="btn">
            {guide.officialLabel ?? "Operatörens formulär"}
          </a>
        )}
      </div>
    </div>
  );
}
