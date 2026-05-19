import type { ReactNode } from "react";

type Stat = { value: string; label: ReactNode; icon: ReactNode };

type Props = {
  eyebrow: string;
  title: ReactNode;
  lead: ReactNode;
  stats: [Stat, Stat, Stat];
};

const ClockIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const ChartIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17 9 11l4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);

const HouseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12 12 2l10 10" />
    <path d="M5 9v11h14V9" />
    <path d="M9 20v-6h6v6" />
  </svg>
);

export const PROBLEM_ICONS = {
  clock: <ClockIcon />,
  chart: <ChartIcon />,
  house: <HouseIcon />,
};

export default function ProblemStats({ eyebrow, title, lead, stats }: Props) {
  return (
    <section className="problem" id="problem">
      <div className="wrap">
        <header className="section-head">
          <span className="section-head__eyebrow reveal">{eyebrow}</span>
          <h2 className="section-head__title reveal">{title}</h2>
          <p className="section-head__lead reveal">{lead}</p>
        </header>

        <div className="problem__grid">
          {stats.map((s, i) => (
            <div className={`stat-card reveal${i > 0 ? ` reveal--stagger-${i + 1}` : ""}`} key={i}>
              <span className="stat-card__icon" aria-hidden="true">
                {s.icon}
              </span>
              <div className="stat-card__value">{s.value}</div>
              <p className="stat-card__label">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
