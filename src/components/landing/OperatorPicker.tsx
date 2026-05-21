import { Link } from "react-router-dom";

/** Hub-only: three regional cards with mini-scene SVGs. */
export default function OperatorPicker() {
  return (
    <section className="op-picker" id="operators" aria-labelledby="op-picker-title">
      <div className="wrap">
        <header className="section-head section-head--left" style={{ maxWidth: 600 }}>
          <span className="section-head__eyebrow reveal">Pick your region</span>
          <h2 className="section-head__title reveal" id="op-picker-title">
            Three regions. <em>Same hands-off promise.</em>
          </h2>
          <p className="section-head__lead reveal">
            Each region has its own look, vehicles and quirks. Open yours to see what we cover and how.
          </p>
        </header>

        <div className="op-picker__grid">
          {/* Skånetrafiken — live */}
          <Link className="op-card op-card--skt" to="/regions/skanetrafiken">
            <span className="op-card__scene" aria-hidden="true">
              <svg viewBox="0 0 280 160" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <linearGradient id="skt-sky-card" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#FFFCEC" />
                    <stop offset="1" stopColor="#FFF6CC" />
                  </linearGradient>
                </defs>
                <rect width="280" height="160" fill="url(#skt-sky-card)" />
                <circle cx="220" cy="40" r="18" fill="#F0B838" />
                <path d="M0,98 Q80,80 160,90 T280,86 L280,160 L0,160 Z" fill="#8FAE5A" />
                <rect x="0" y="120" width="280" height="40" fill="#F0C84A" />
                <g fill="#E2B33A">
                  <rect x="0" y="120" width="280" height="3" />
                  <rect x="0" y="128" width="280" height="2" opacity="0.6" />
                  <rect x="0" y="138" width="280" height="2" opacity="0.5" />
                </g>
                <g transform="translate(58, 96)">
                  <rect x="-3" y="0" width="6" height="22" fill="#B5524E" />
                  <polygon points="-7,0 7,0 5,-4 -5,-4" fill="#B5524E" />
                  <g stroke="#FFFCEC" strokeWidth={2.5} strokeLinecap="round">
                    <line x1="0" y1="-2" x2="0" y2="-22" />
                    <line x1="0" y1="-2" x2="18" y2="6" />
                    <line x1="0" y1="-2" x2="-18" y2="6" />
                  </g>
                  <circle r="2.5" fill="#FFFCEC" />
                </g>
                <g transform="translate(150, 102)">
                  <rect x="0" y="0" width="62" height="14" rx="3" fill="#5B3F86" />
                  <path d="M62,0 L74,4 L74,14 L62,14 Z" fill="#432D66" />
                  {[3, 13, 23, 33, 43, 53].map((x) => (
                    <rect key={x} x={x} y="3" width="6" height="6" rx="1" fill="#FFFCEC" />
                  ))}
                </g>
              </svg>
            </span>
            <span className="op-card__body">
              <span className="op-card__name">Skånetrafiken</span>
              <span className="op-card__region">Skåne · Pågatåg &amp; Öresundståg</span>
              <span className="op-card__cta">
                Open
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </span>
            </span>
          </Link>

          {/* SL — coming soon (no route yet; inert card) */}
          <div className="op-card op-card--sl op-card--coming" role="presentation" aria-label="SL — coming soon">
            <span className="op-card__badge">Coming soon</span>
            <span className="op-card__scene" aria-hidden="true">
              <svg viewBox="0 0 280 160" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <linearGradient id="sl-sky-card" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#EAF3FB" />
                    <stop offset="1" stopColor="#C8DDF0" />
                  </linearGradient>
                </defs>
                <rect width="280" height="160" fill="url(#sl-sky-card)" />
                <g fill="#FFFFFF" opacity="0.9">
                  <circle cx="60" cy="36" r="10" />
                  <circle cx="74" cy="32" r="12" />
                  <circle cx="88" cy="36" r="10" />
                </g>
                <path d="M0,86 Q40,76 80,82 T160,82 L160,98 L0,98 Z" fill="#5E8CB8" opacity="0.5" />
                <g>
                  <rect x="160" y="78" width="22" height="32" fill="#E2B33A" />
                  <polygon points="160,78 182,78 171,70" fill="#5C2B26" />
                  <rect x="184" y="84" width="20" height="26" fill="#B5524E" />
                  <polygon points="184,84 204,84 194,76" fill="#3D1F1B" />
                  <rect x="206" y="80" width="22" height="30" fill="#3F6CA0" />
                  <polygon points="206,80 228,80 217,72" fill="#5C2B26" />
                  <rect x="230" y="86" width="22" height="24" fill="#D9B584" />
                  <polygon points="230,86 252,86 241,78" fill="#3D1F1B" />
                </g>
                <rect x="0" y="110" width="280" height="50" fill="#5E8CB8" />
                <g stroke="#3F6CA0" strokeWidth={1} fill="none" opacity="0.6">
                  <path d="M0,124 Q35,121 70,124 T140,124 T210,124 T280,124" />
                  <path d="M0,138 Q35,135 70,138 T140,138 T210,138 T280,138" />
                </g>
                <g transform="translate(40, 122)">
                  <path d="M0,4 L24,4 L20,10 L4,10 Z" fill="#FFFCEC" />
                  <rect x="10" y="-4" width="3" height="8" fill="#3F6CA0" />
                </g>
                <g transform="translate(176, 130)">
                  <rect x="0" y="0" width="62" height="14" rx="2.4" fill="#2E69B5" />
                  <rect x="0" y="6" width="62" height="2" fill="#FFFCEC" />
                  {[3, 15, 27, 39, 51].map((x) => (
                    <rect key={x} x={x} y="2" width="8" height="3" rx="1" fill="#FFFCEC" />
                  ))}
                </g>
              </svg>
            </span>
            <span className="op-card__body">
              <span className="op-card__name">SL</span>
              <span className="op-card__region">Stockholm · Tunnelbana &amp; Pendeltåg</span>
              <span className="op-card__cta">Coming soon</span>
            </span>
          </div>

          {/* Västtrafik — coming soon (no route yet; inert card) */}
          <div className="op-card op-card--vt op-card--coming" role="presentation" aria-label="Västtrafik — coming soon">
            <span className="op-card__badge">Coming soon</span>
            <span className="op-card__scene" aria-hidden="true">
              <svg viewBox="0 0 280 160" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <linearGradient id="vt-sky-card" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#D8EAF8" />
                    <stop offset="1" stopColor="#A8CFE6" />
                  </linearGradient>
                </defs>
                <rect width="280" height="160" fill="url(#vt-sky-card)" />
                <g fill="#FFFFFF" opacity="0.95">
                  <circle cx="40" cy="28" r="10" />
                  <circle cx="54" cy="24" r="12" />
                  <circle cx="68" cy="28" r="10" />
                  <circle cx="180" cy="36" r="9" />
                  <circle cx="194" cy="32" r="11" />
                  <circle cx="208" cy="36" r="9" />
                </g>
                <g fill="#3F5670">
                  <rect x="40" y="50" width="4" height="60" />
                  <polygon points="40,50 86,50 92,46 40,46" />
                  <rect x="86" y="50" width="3" height="14" />
                  <rect x="78" y="62" width="3" height="6" />
                </g>
                <rect x="0" y="110" width="280" height="50" fill="#2E5A8C" />
                <g stroke="#1B4E8B" strokeWidth={1.2} fill="none" opacity="0.6">
                  <path d="M0,126 Q35,123 70,126 T140,126 T210,126 T280,126" />
                  <path d="M0,142 Q40,139 80,142 T160,142 T240,142 T280,142" />
                </g>
                <g transform="translate(140, 124)">
                  <rect x="0" y="0" width="68" height="16" rx="3" fill="#1B4E8B" />
                  <path d="M68,0 L82,3 L82,16 L68,16 Z" fill="#143A6B" />
                  <rect x="0" y="8" width="82" height="2" fill="#FFFFFF" />
                  {[3, 14, 25, 36, 47, 58].map((x) => (
                    <rect key={x} x={x} y="3" width="7" height="4" rx="1" fill="#D8EAF8" />
                  ))}
                </g>
              </svg>
            </span>
            <span className="op-card__body">
              <span className="op-card__name">Västtrafik</span>
              <span className="op-card__region">Västra Götaland · Spårvagn &amp; tåg</span>
              <span className="op-card__cta">Coming soon</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
