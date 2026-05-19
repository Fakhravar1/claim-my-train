import type { ReactNode } from "react";

type Stat = { value: ReactNode; label: ReactNode };

type Props = {
  title: ReactNode;
  lead: ReactNode;
  stats: [Stat, Stat, Stat];
  quoteText: ReactNode;
  quoteAuthor: string;
};

export default function TrustBand({ title, lead, stats, quoteText, quoteAuthor }: Props) {
  return (
    <section className="trust" id="trust">
      <div className="wrap">
        <header className="section-head">
          <span className="section-head__eyebrow reveal">Numbers, no fluff</span>
          <h2 className="section-head__title reveal">{title}</h2>
          <p className="section-head__lead reveal">{lead}</p>
        </header>

        <div className="trust__stats reveal">
          {stats.map((s, i) => (
            <div className="trust__stat" key={i}>
              <div className="trust__value">{s.value}</div>
              <div className="trust__label">{s.label}</div>
            </div>
          ))}
        </div>

        <figure className="trust__quote reveal">
          <p className="trust__quote-text">{quoteText}</p>
          <figcaption className="trust__quote-author">— {quoteAuthor}</figcaption>
        </figure>
      </div>
    </section>
  );
}
