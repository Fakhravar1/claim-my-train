import { useEffect } from "react";
import type { ReactNode } from "react";

type Props = {
  /** Full-bleed background scene SVG (inline JSX or component). */
  scene: ReactNode;
  /** Pill above the title. */
  eyebrow: ReactNode;
  /** H1 content. */
  title: ReactNode;
  /** Paragraph below the title. */
  lead: ReactNode;
};

/**
 * Hero with parallax on the background scene (slower than scroll).
 * Respects prefers-reduced-motion.
 */
export default function Hero({ scene, eyebrow, title, lead }: Props) {
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const svg = document.querySelector<SVGSVGElement>(".hero-scene svg");
    if (!svg) return;
    const onScroll = () => {
      svg.style.transform = `translateY(${window.scrollY * 0.18}px)`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="hero" id="top">
      <div className="hero-scene" aria-hidden="true">
        {scene}
      </div>

      <div className="wrap">
        <div className="hero__inner">
          <div className="hero__eyebrow reveal" data-revealed="true">
            <span className="pulse" aria-hidden="true" />
            {eyebrow}
          </div>
          <h1 className="hero__title reveal" data-revealed="true">
            {title}
          </h1>
          <p className="hero__lead reveal" data-revealed="true">
            {lead}
          </p>
          <div className="hero__cta reveal" data-revealed="true">
            <a href="#signup" className="cmt-btn cmt-btn--lg">
              Start claiming refunds
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </a>
            <a href="#how" className="hero__cta-secondary">
              See how it works
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14" />
                <path d="m19 12-7 7-7-7" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
