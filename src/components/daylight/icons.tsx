import type { SVGProps } from "react";

/**
 * Inline stroke icons, ported 1:1 from the design prototype's `I` object
 * (app.jsx). Kept self-contained rather than mapped to lucide so the SVG paths
 * match the handoff exactly. `currentColor` for stroke/fill so they inherit.
 */
type IconProps = SVGProps<SVGSVGElement>;

export const ArrowIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
  </svg>
);

export const SearchIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const BellIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export const GoogleIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M21.35 11.1H12v3.83h5.51c-.5 2.6-2.7 4.07-5.5 4.07-3.27 0-5.91-2.65-5.91-5.91s2.64-5.91 5.91-5.91c1.41 0 2.68.5 3.69 1.32l2.78-2.78C16.78 4.32 14.55 3.4 12 3.4 6.93 3.4 2.8 7.53 2.8 12.6S6.93 21.8 12 21.8c5.27 0 9.6-3.84 9.6-9.6 0-.42-.04-.86-.13-1.27z" />
  </svg>
);

export const ShieldIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="m9 12 2 2 4-4" />
  </svg>
);
