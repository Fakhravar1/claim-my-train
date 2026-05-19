export default function SkanetrafikenSignup() {
  return (
    <svg viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="skt-signup-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFCEC" stopOpacity="0" />
          <stop offset="1" stopColor="#FFF6D6" />
        </linearGradient>
      </defs>
      <rect width="1440" height="320" fill="url(#skt-signup-sky)" />
      <path d="M0,200 L1440,200 L1440,320 L0,320 Z" fill="#8FAE5A" />
      <path d="M0,240 C300,232 720,234 1080,238 C1260,240 1380,238 1440,240 L1440,320 L0,320 Z" fill="#F0C84A" />
      <g stroke="#D9A82F" strokeWidth={2} opacity="0.55">
        <path d="M0,262 Q360,256 720,260 T1440,260" />
        <path d="M0,286 Q360,280 720,284 T1440,284" />
        <path d="M0,308 Q360,302 720,306 T1440,306" />
      </g>
      <g transform="translate(220, 200)" opacity="0.85">
        <rect x="-4" y="0" width="8" height="32" fill="#7A2E2A" />
        <g stroke="#FFFCEC" strokeWidth={2.4} strokeLinecap="round">
          <line x1="0" y1="-2" x2="0" y2="-26" />
          <line x1="0" y1="-2" x2="22" y2="6" />
          <line x1="0" y1="-2" x2="-22" y2="6" />
        </g>
        <circle r="2.4" fill="#FFFCEC" />
      </g>
      <g transform="translate(620, 220)">
        <rect x="0" y="0" width="120" height="20" rx="4" fill="#5B3F86" />
        <path d="M120,0 L138,5 L138,20 L120,20 Z" fill="#432D66" />
        <rect x="0" y="13" width="138" height="2.5" fill="#F0C84A" />
        {[4, 17, 30, 43, 56, 69, 82, 95].map((x) => (
          <rect key={x} x={x} y="3" width="9" height="6" rx="1" fill="#FFFCEC" />
        ))}
        <rect x="108" y="3" width="8" height="6" rx="1" fill="#FFFCEC" />
      </g>
    </svg>
  );
}
