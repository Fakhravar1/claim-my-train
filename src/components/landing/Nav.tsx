import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

type Props =
  | { variant?: "hub" }
  | { variant: "regional"; operatorName: string };

/** Top nav for landing pages. Sticky border on scroll. */
export default function Nav(props: Props) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const setNav = () => nav.setAttribute("data-scrolled", String(window.scrollY > 16));
    setNav();
    window.addEventListener("scroll", setNav, { passive: true });
    return () => window.removeEventListener("scroll", setNav);
  }, []);

  return (
    <nav className="nav" id="nav" aria-label="Primary" ref={navRef}>
      <div className="nav__inner">
        {props.variant === "regional" ? (
          <Link to="/" className="back-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m11 18-6-6 6-6" />
            </svg>
            All regions
          </Link>
        ) : (
          <a href="#top" className="nav__brand">
            <span className="dot" aria-hidden="true" />
            Claim My Train
          </a>
        )}
        <div className="nav__links">
          {props.variant === "regional" && (
            <span className="op-badge" aria-label="Current region">
              {props.operatorName}
            </span>
          )}
          <a href="#how" className="nav__link">
            How it works
          </a>
          <Link
            to="/login"
            className="cmt-btn"
            style={{ height: "2.5rem", padding: "0 1.125rem", fontSize: "0.9375rem" }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </nav>
  );
}
