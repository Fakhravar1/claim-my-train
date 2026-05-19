import type { ReactNode } from "react";

type Step = { title: string; body: ReactNode };

type Props = {
  title?: ReactNode;
  lead?: ReactNode;
  steps: [Step, Step, Step];
};

// The three step SVGs are identical across all regions — they reference
// `var(--cmt-*)` color tokens, so the per-region theme.css automatically
// retints them. Hard-coded here (instead of taking SVG as a prop) keeps the
// component simple and the regional pages thin.

const Step1Art = () => (
  <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
    <rect width="200" height="120" fill="var(--cmt-mist)" />
    <rect x="68" y="14" width="64" height="100" rx="10" fill="var(--cmt-paper)" stroke="var(--cmt-forest)" strokeWidth={2} />
    <rect x="76" y="26" width="48" height="6" rx="2" fill="var(--cmt-sage-soft)" />
    <rect x="76" y="38" width="40" height="5" rx="2" fill="var(--cmt-mist-deep)" />
    <rect x="76" y="48" width="48" height="32" rx="4" fill="var(--cmt-mist)" />
    <circle cx="84" cy="58" r="3" fill="var(--cmt-forest)" />
    <line x1="84" y1="60" x2="84" y2="74" stroke="var(--cmt-sage)" strokeWidth={2} strokeDasharray="2 2" />
    <circle cx="84" cy="76" r="3" fill="var(--cmt-sunflower)" />
    <rect x="92" y="55" width="26" height="4" rx="1" fill="var(--cmt-forest)" />
    <rect x="92" y="73" width="22" height="4" rx="1" fill="var(--cmt-sunflower-deep)" />
    <rect x="80" y="88" width="40" height="14" rx="7" fill="var(--cmt-forest)" />
    <rect x="86" y="92" width="28" height="2.5" rx="1" fill="var(--cmt-paper)" />
    <circle cx="22" cy="92" r="14" fill="var(--cmt-sunflower)" />
    <circle cx="22" cy="92" r="9" fill="var(--cmt-forest-darker)" />
    <circle cx="178" cy="34" r="10" fill="var(--cmt-sage-soft)" />
  </svg>
);

const Step2Art = () => (
  <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
    <rect width="200" height="120" fill="var(--cmt-mist)" />
    <path d="M0,86 Q60,72 110,82 T200,84 L200,120 L0,120 Z" fill="var(--cmt-sage-soft)" />
    <path d="M0,100 Q70,86 140,98 T200,100 L200,120 L0,120 Z" fill="var(--cmt-sage)" />
    <line x1="0" y1="106" x2="200" y2="106" stroke="var(--cmt-forest)" strokeWidth={1.4} strokeDasharray="4 4" />
    <g transform="translate(58, 96)">
      <rect x="0" y="0" width="44" height="10" rx="2.4" fill="var(--cmt-forest)" />
      <path d="M44,0 L54,4 L54,10 L44,10 Z" fill="var(--cmt-forest-deep)" />
      <rect x="3" y="2.5" width="5" height="3.6" rx="1" fill="var(--cmt-paper)" />
      <rect x="11" y="2.5" width="5" height="3.6" rx="1" fill="var(--cmt-paper)" />
      <rect x="19" y="2.5" width="5" height="3.6" rx="1" fill="var(--cmt-paper)" />
      <rect x="27" y="2.5" width="5" height="3.6" rx="1" fill="var(--cmt-paper)" />
      <rect x="35" y="2.5" width="5" height="3.6" rx="1" fill="var(--cmt-paper)" />
    </g>
    <g transform="translate(150, 36)">
      <circle r="22" fill="var(--cmt-paper)" stroke="var(--cmt-forest)" strokeWidth={2} />
      <circle r="14" fill="none" stroke="var(--cmt-sage)" strokeWidth={1.5} strokeDasharray="2 3" />
      <circle r="6" fill="var(--cmt-sunflower)" />
      <circle r="2.5" fill="var(--cmt-forest-darker)" />
    </g>
    <circle cx="40" cy="32" r="14" fill="var(--cmt-sunflower)" />
  </svg>
);

const Step3Art = () => (
  <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
    <rect width="200" height="120" fill="var(--cmt-mist)" />
    <rect x="46" y="28" width="84" height="68" rx="4" fill="var(--cmt-paper)" stroke="var(--cmt-forest)" strokeWidth={2} />
    <path d="M46,28 L88,60 L130,28" stroke="var(--cmt-forest)" strokeWidth={2} fill="none" />
    <rect x="56" y="68" width="46" height="3" rx="1" fill="var(--cmt-sage-soft)" />
    <rect x="56" y="76" width="32" height="3" rx="1" fill="var(--cmt-sage-soft)" />
    <g transform="translate(150, 78)">
      <circle r="22" fill="var(--cmt-sunflower)" stroke="var(--cmt-sunflower-deep)" strokeWidth={2} />
      <text x="0" y="2" textAnchor="middle" fontFamily="Fraunces, serif" fontWeight={600} fontSize="14" fill="var(--cmt-forest-darker)" dominantBaseline="middle">100</text>
      <text x="0" y="13" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight={600} fontSize="6" fill="var(--cmt-forest-darker)">KR</text>
    </g>
    <g transform="translate(38, 90)">
      <circle r="14" fill="var(--cmt-sunflower)" stroke="var(--cmt-sunflower-deep)" strokeWidth={1.6} />
      <text x="0" y="2" textAnchor="middle" fontFamily="Fraunces, serif" fontWeight={600} fontSize="9" fill="var(--cmt-forest-darker)" dominantBaseline="middle">100</text>
    </g>
    <circle cx="160" cy="34" r="14" fill="var(--cmt-forest)" />
    <path d="M154 34 l4 4 l8 -8" stroke="var(--cmt-paper)" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const STEP_ARTS = [<Step1Art />, <Step2Art />, <Step3Art />];

export default function HowItWorks({
  title = (
    <>
      Three small steps. <em>Then you forget about it.</em>
    </>
  ),
  lead = "Set it up once with your route and ticket details. We do the rest, quietly, every day, while you sleep.",
  steps,
}: Props) {
  return (
    <section className="how" id="how">
      <div className="wrap">
        <header className="section-head">
          <span className="section-head__eyebrow reveal">How it works</span>
          <h2 className="section-head__title reveal">{title}</h2>
          <p className="section-head__lead reveal">{lead}</p>
        </header>

        <div className="how__grid">
          {steps.map((s, i) => (
            <article className={`step reveal${i > 0 ? ` reveal--stagger-${i + 1}` : ""}`} key={i}>
              <span className="step__num">{i + 1}</span>
              <div className="step__art" aria-hidden="true">
                {STEP_ARTS[i]}
              </div>
              <h3 className="step__title">{s.title}</h3>
              <p className="step__body">{s.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
