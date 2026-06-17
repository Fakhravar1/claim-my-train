import type { ReactNode } from "react";
import { ArrowIcon, SearchIcon } from "./icons";

/**
 * Static shell pieces for the merged Daylight page (`/`): Nav, Hero, ValueProps,
 * Footer. Ported from the design prototype's app.jsx; copy is the handoff's
 * Swedish verbatim. Behaviour callbacks are wired by DaylightApp.
 */

export function Nav({ onLogin }: { onLogin: () => void }) {
  return (
    <nav className="nav">
      <div className="wrap nav__in">
        <a href="#" className="brand">
          <span className="brand__mark" /> Claim My Train
        </a>
        <div className="nav__right">
          <a href="#board" className="nav__link">Live-tavlan</a>
          <a href="#how" className="nav__link">Så funkar det</a>
          <button className="btn btn--dark" onClick={onLogin}>Logga in</button>
        </div>
      </div>
    </nav>
  );
}

export function Hero({ onUnknown, onSearch }: { onUnknown: () => void; onSearch: () => void }) {
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
          <button className="btn btn--ghost btn--lg" onClick={onUnknown}>
            Vet inte vilken avgång?
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
    { h: "Du är osäker på din rätt", p: "Precis under 20 minuter, eller bara osäker? Vi visar vad våra uppgifter säger och hur nära gränsen du ligger.", a: "Sök din resa", on: onSearch },
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
        <span>© 2026 Claim My Train</span>
        <div className="footer__links">
          <a href="#">Integritet</a>
          <a href="#">Så ansöker vi</a>
          <a href="#">Kontakt</a>
        </div>
      </div>
    </footer>
  );
}
