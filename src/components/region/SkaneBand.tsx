/**
 * The decorative weather band at the top of /regions/skanetrafiken pages —
 * sky, sun, clouds, a slow-spinning grain windmill, the rapeseed field
 * ribbon. Pulled from the design-system app.html. Pure SVG, no JS.
 */
export default function SkaneBand() {
  return (
    <div className="skane-band" aria-hidden="true">
      <svg viewBox="0 0 1440 220" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="skane-band-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9BCFED" />
            <stop offset="0.55" stopColor="#C4E2F4" />
            <stop offset="1" stopColor="#E8F4FB" />
          </linearGradient>
          <radialGradient id="skane-band-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FFE499" stopOpacity="0.45" />
            <stop offset="1" stopColor="#FFE499" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="1440" height="220" fill="url(#skane-band-sky)" />

        {/* Cumulus clouds */}
        <g fill="#FFFFFF" opacity="0.92">
          <g>
            <circle cx="160" cy="60" r="22" />
            <circle cx="192" cy="48" r="28" />
            <circle cx="224" cy="58" r="22" />
          </g>
          <g opacity="0.85">
            <circle cx="800" cy="42" r="18" />
            <circle cx="828" cy="32" r="24" />
            <circle cx="860" cy="44" r="18" />
          </g>
          <g opacity="0.78">
            <circle cx="1220" cy="80" r="20" />
            <circle cx="1250" cy="70" r="26" />
            <circle cx="1282" cy="80" r="20" />
          </g>
        </g>

        {/* Sun */}
        <circle cx="1080" cy="70" r="100" fill="url(#skane-band-sun)" />
        <circle cx="1080" cy="70" r="32" fill="#FFD86B" />

        {/* Drifting birds */}
        <g stroke="#2D1E4D" strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.6}>
          <path d="M600 70 q7 -5 14 0 q7 -5 14 0" />
          <path d="M700 100 q5 -4 10 0 q5 -4 10 0" />
        </g>

        {/* Distant green horizon */}
        <path d="M0,150 L1440,150 L1440,220 L0,220 Z" fill="#CBE07E" opacity="0.85" />
        <path
          d="M0,160 C220,150 460,154 720,156 C980,158 1240,154 1440,158 L1440,220 L0,220 Z"
          fill="#8FAE5A"
        />

        {/* Grain-grinding windmill */}
        <g transform="translate(300, 160)">
          <ellipse cx="0" cy="2" rx="48" ry="8" fill="#6E914B" />
          <path d="M-22,2 L-17,-66 L17,-66 L22,2 Z" fill="#C9B8A2" />
          <g stroke="#A89880" strokeWidth={1} opacity={0.55}>
            <path d="M-21,-10 L21,-10" />
            <path d="M-20,-26 L20,-26" />
            <path d="M-19,-42 L19,-42" />
            <path d="M-18,-58 L18,-58" />
          </g>
          <rect x="-6" y="-16" width="12" height="18" rx="2" fill="#5C3A1F" />
          <rect x="-5" y="-36" width="10" height="8" rx="1.5" fill="#5C3A1F" />
          <path d="M-22,-66 Q0,-88 22,-66 Z" fill="#7A2E2A" />
          <rect x="-1.5" y="-94" width="3" height="10" fill="#5C2421" />
          <line x1="0" y1="-78" x2="-38" y2="-8" stroke="#7A2E2A" strokeWidth={3} opacity={0.7} />

          <g transform="translate(0, -76)">
            <g className="mill-sails">
              {[0, 90, 180, 270].map((rot) => (
                <g key={rot} transform={`rotate(${rot})`}>
                  <rect x="-2.4" y="-58" width="4.8" height="58" fill="#7A4A22" />
                  <g stroke="#7A4A22" strokeWidth={1.6}>
                    <line x1="-11" y1="-50" x2="11" y2="-50" />
                    <line x1="-11" y1="-40" x2="11" y2="-40" />
                    <line x1="-11" y1="-30" x2="11" y2="-30" />
                    <line x1="-11" y1="-20" x2="11" y2="-20" />
                    <line x1="-11" y1="-10" x2="11" y2="-10" />
                  </g>
                  <rect x="-10" y="-50" width="8" height="42" fill="#F4ECD8" opacity={0.85} />
                </g>
              ))}
              <circle r="5" fill="#3D2510" />
              <circle r="2.5" fill="#7A4A22" />
            </g>
          </g>
        </g>

        {/* Rapeseed field ribbon */}
        <path
          d="M0,180 C300,172 720,174 1080,178 C1260,180 1380,178 1440,180 L1440,220 L0,220 Z"
          fill="#F0C84A"
        />
        <g stroke="#D9A82F" strokeWidth={2} opacity={0.55}>
          <path d="M0,194 Q360,188 720,192 T1440,192" />
          <path d="M0,206 Q360,200 720,204 T1440,204" />
        </g>
      </svg>
    </div>
  );
}
