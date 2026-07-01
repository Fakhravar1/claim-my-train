import { useEffect, useRef, useState, type ReactNode } from "react";
import type * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ADMIN_USER_ID } from "@/lib/admin";
import { ArrowIcon, SearchIcon } from "./icons";
import { CoverageButton } from "./CoverageModal";

/**
 * Static shell pieces for the merged Daylight page (`/`): Nav, Hero, ValueProps,
 * Footer. Ported from the design prototype's app.jsx; copy is the handoff's
 * Swedish verbatim. Behaviour callbacks are wired by DaylightApp.
 */

type NavProps = {
  /** True once auth has resolved and a user is signed in. */
  signedIn: boolean;
  /** Display label for the signed-in account (name or email). */
  accountLabel: string;
  onSignOut: () => void;
  /** Opens the in-modal sign-in pop-up (signed-out only). */
  onLogin: () => void;
};

export function Nav({ signedIn, accountLabel, onSignOut, onLogin }: NavProps) {
  const navigate = useNavigate();
  const scrollToHow = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const how = document.getElementById("how");
    if (how) {
      // The "Så funkar det" section is on this page (the home app) — smooth-scroll.
      how.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      // Not on the home page (e.g. /settings, /claim-review) — go home, then scroll
      // once it mounts. The home page is lazy-loaded, so poll briefly for #how
      // (rather than a single frame) and give up after ~2s.
      navigate("/");
      const start = Date.now();
      const tryScroll = () => {
        const target = document.getElementById("how");
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (Date.now() - start < 2000) {
          requestAnimationFrame(tryScroll);
        }
      };
      requestAnimationFrame(tryScroll);
    }
  };
  return (
    <nav className="nav">
      <div className="wrap nav__in">
        <Link to="/" className="brand" aria-label="Qvitta — till startsidan">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="100%" height="100%" style={{ display: "block" }}>
              <rect width="64" height="64" rx="14" fill="#0E1B17" />
              <circle cx="29" cy="29" r="15" fill="none" stroke="#37E5B0" strokeWidth="7" />
              <line x1="33" y1="33" x2="49" y2="51" stroke="#37E5B0" strokeWidth="7" strokeLinecap="round" />
            </svg>
          </span>
          <span className="brand__word">Qvitta</span>
        </Link>
        <div className="nav__right">
          <Link to="/faq" className="nav__cta">FAQ</Link>
          <a href="#how" className="nav__cta" onClick={scrollToHow}>Så funkar det</a>
          {signedIn ? (
            <AccountMenu label={accountLabel} onSignOut={onSignOut} />
          ) : (
            <button className="btn btn--dark" onClick={onLogin}>Logga in</button>
          )}
        </div>
      </div>
    </nav>
  );
}

function AccountMenu({ label, onSignOut }: { label: string; onSignOut: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.id === ADMIN_USER_ID;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div className="nav__account" ref={ref}>
      <button className="btn btn--ghost" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div className="nav__menu" role="menu">
          <Link to="/settings" onClick={() => setOpen(false)}>Inställningar</Link>
          <Link to="/my-delays" onClick={() => setOpen(false)}>Mina förseningar</Link>
          {isAdmin && <Link to="/admin" onClick={() => setOpen(false)}>Digest-statistik</Link>}
          <button onClick={() => { setOpen(false); onSignOut(); }}>Logga ut</button>
        </div>
      )}
    </div>
  );
}

export function Hero({ onSearch }: { onSearch: () => void }) {
  return (
    <header className="hero">
      <div className="hero__glow" aria-hidden="true" />
      <div className="wrap">
        <p className="eyebrow">Live · försenade tåg just nu</p>
        <h1>
          Sent tåg? Vi hittar avgången<br />
          och visar vad du kan ha rätt till.
        </h1>
        <p className="hero__lead">
          Du vet att du var sen — men inte alltid vilket tåg det var, eller om förseningen räcker för
          pengar tillbaka. Enligt våra uppgifter ser du direkt vilka avgångar som kan ge ersättning.
          Sök fram din resa och ansök på skärmen.
        </p>
        <div className="hero__cta">
          <button className="btn btn--accent btn--lg" onClick={onSearch}>
            Sök din resa <SearchIcon width={17} height={17} />
          </button>
        </div>
      </div>
    </header>
  );
}

type ValuePropsHandlers = {
  onUnknown: () => void;
  onSearch: () => void;
  onHabits: () => void;
};

export function ValueProps({ onUnknown, onSearch, onHabits }: ValuePropsHandlers) {
  const items: { h: string; p: string; a: string; on: () => void }[] = [
    { h: "Du vet inte vilket tåg", p: "Du var sen men minns inte avgången. Ange sträcka och tid — vi matchar mot trafikdatan och hittar rätt tåg.", a: "Hitta min avgång", on: onUnknown },
    { h: "Du är osäker på din rätt", p: "Precis under gränsen, eller bara osäker? Vi visar vad våra uppgifter säger och hur nära gränsen du ligger.", a: "Sök din resa", on: onSearch },
    { h: "Vi håller koll åt dig", p: "Ange dina pendlarvanor så mejlar vi dig så fort tågen du brukar ta är försenade — du missar aldrig en ersättning du kan ha rätt till.", a: "Ställ in pendlarvanor", on: onHabits },
    { h: "Vi rör aldrig dina pengar", p: "Ersättningen betalas ut direkt från operatören till din valda mottagningsmetod — Swish eller bankkonto. Pengarna passerar aldrig oss.", a: "Så funkar utbetalningen", on: onSearch },
  ];
  return (
    <section className="vprops" id="how">
      <div className="wrap">
        <h2 className="vprops__h">Tjänsten gör det jobbiga åt dig</h2>
        <div className="vgrid">
          {items.map((it, i) => (
            <article className="vcard" key={i}>
              <span className="vcard__no">0{i + 1}</span>
              <h3>{it.h}</h3>
              <p>{it.p}</p>
              <button className="linkbtn" onClick={it.on}>
                {it.a} <ArrowIcon width={14} height={14} />
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Footer(): ReactNode {
  return (
    <footer className="footer">
      <div className="wrap footer__in">
        <span>© 2026 Qvitta</span>
        <div className="footer__links">
          <CoverageButton className="linklike footer__cov" />
          <Link to="/integritet">Integritet</Link>
          <Link to="/faq">Vanliga frågor</Link>
          <Link to="/genvag">Installera genvägen</Link>
          <a href="mailto:kontakt@qvitta.nu">Kontakt</a>
        </div>
      </div>
    </footer>
  );
}
