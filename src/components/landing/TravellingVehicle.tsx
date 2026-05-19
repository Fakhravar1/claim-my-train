import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type Props = {
  /** The inner train/tram/subway SVG content (children of the <svg> wrapper). */
  vehicle: ReactNode;
  /** Optional smoke SVG inner content for the hub's green train. Pass null on regions that don't smoke. */
  smoke?: ReactNode;
};

/**
 * Fixed-position vehicle at the bottom edge, position tied to scroll progress.
 * Hides itself below 640px via the `.train-rail` CSS rule in landing-base.css.
 * Respects `prefers-reduced-motion` by skipping rAF updates and centering
 * the vehicle statically.
 */
export default function TravellingVehicle({ vehicle, smoke }: Props) {
  const trainRef = useRef<SVGSVGElement>(null);
  const smokeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const train = trainRef.current;
    if (!train) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      // Static position: middle of viewport, no bob.
      train.style.transform = `translate3d(${window.innerWidth / 2 - 60}px, 0, 0)`;
      if (smokeRef.current) {
        smokeRef.current.style.transform = `translate3d(${window.innerWidth / 2 + 30}px, -4px, 0)`;
      }
      return;
    }

    let rafQueued = false;
    const update = () => {
      rafQueued = false;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const p = Math.max(0, Math.min(1, window.scrollY / max));
      const vw = window.innerWidth;
      const x = -120 + p * (vw + 240);
      const bob = Math.sin(p * Math.PI * 6) * 1.5;
      train.style.transform = `translate3d(${x}px, ${bob}px, 0)`;
      if (smokeRef.current) {
        smokeRef.current.style.transform = `translate3d(${x + 90}px, ${bob - 4}px, 0)`;
        const fade = p < 0.04 ? p / 0.04 : 1;
        smokeRef.current.style.opacity = String(0.85 * fade);
      }
    };

    const onScroll = () => {
      if (rafQueued) return;
      rafQueued = true;
      requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="train-rail" aria-hidden="true">
      <div className="train-rail__track" />
      {smoke && (
        <svg className="train-rail__smoke" width="80" height="60" viewBox="0 0 80 60" ref={smokeRef}>
          {smoke}
        </svg>
      )}
      <svg className="train-rail__train" width="120" height="60" viewBox="0 0 120 60" ref={trainRef}>
        {vehicle}
      </svg>
    </div>
  );
}
