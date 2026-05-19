export default function SkanetrafikenHero() {
  return (
    <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" role="img">
      <defs>
        <linearGradient id="skt-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFCEC" />
          <stop offset="0.55" stopColor="#FFF6D6" />
          <stop offset="1" stopColor="#FFEBA8" />
        </linearGradient>
        <radialGradient id="skt-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F0C84A" stopOpacity="0.55" />
          <stop offset="1" stopColor="#F0C84A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1440" height="900" fill="url(#skt-sky)" />
      <circle cx="260" cy="200" r="160" fill="url(#skt-sun)" />
      <circle cx="260" cy="200" r="58" fill="#F0C84A" />
      <g stroke="#3A2F4E" strokeWidth={2.4} fill="none" strokeLinecap="round" opacity="0.6">
        <path d="M380 240 q9 -7 18 0 q9 -7 18 0" />
        <path d="M450 280 q7 -5 14 0 q7 -5 14 0" />
        <path d="M160 260 q6 -4 12 0 q6 -4 12 0" />
      </g>
      <path d="M0,560 L1440,560 L1440,900 L0,900 Z" fill="#CBE07E" opacity="0.7" />
      <path d="M0,560 C200,540 400,545 720,550 C1040,555 1240,548 1440,558 L1440,900 L0,900 Z" fill="#8FAE5A" />
      <path d="M0,650 C300,640 600,640 900,645 C1200,650 1320,645 1440,645 L1440,900 L0,900 Z" fill="#6E914B" />
      <g transform="translate(1100, 580)">
        <rect x="-10" y="0" width="20" height="78" fill="#B5524E" />
        <polygon points="-14,0 14,0 10,-8 -10,-8" fill="#7A2E2A" />
        <g stroke="#FFFCEC" strokeWidth={6} strokeLinecap="round">
          <line x1="0" y1="-6" x2="0" y2="-76" />
          <line x1="0" y1="-6" x2="62" y2="20" />
          <line x1="0" y1="-6" x2="-62" y2="20" />
          <line x1="0" y1="-6" x2="-20" y2="-68" />
        </g>
        <circle r="6" fill="#FFFCEC" />
        <rect x="-4" y="60" width="8" height="22" fill="#FFFCEC" />
      </g>
      <path d="M0,720 C300,710 600,712 900,718 C1200,724 1320,718 1440,720 L1440,900 L0,900 Z" fill="#F0C84A" />
      <g stroke="#D9A82F" strokeWidth={3} opacity="0.55">
        <path d="M0,742 Q300,734 600,742 T1200,744 T1440,744" />
        <path d="M0,768 Q300,762 600,766 T1200,766 T1440,766" />
        <path d="M0,796 Q300,792 600,796 T1200,798 T1440,798" />
        <path d="M0,824 Q300,820 600,824 T1200,826 T1440,826" />
        <path d="M0,856 Q300,852 600,856 T1200,858 T1440,858" />
      </g>
      <line x1="0" y1="690" x2="1440" y2="690" stroke="#5B3F86" strokeWidth={2} strokeDasharray="8 6" opacity="0.5" />
      <g transform="translate(540, 670)">
        <rect x="0" y="0" width="160" height="22" rx="5" fill="#5B3F86" />
        <path d="M160,0 L182,5 L182,22 L160,22 Z" fill="#432D66" />
        <rect x="0" y="14" width="182" height="3" fill="#F0C84A" />
        {[6, 22, 38, 54, 70, 86, 102, 118, 134].map((x) => (
          <rect key={x} x={x} y="4" width="12" height="8" rx="1.6" fill="#FFFCEC" />
        ))}
        <rect x="150" y="4" width="8" height="8" rx="1.6" fill="#FFFCEC" />
        <path d="M162,4 Q176,6 180,14 L162,14 Z" fill="#FFFCEC" />
      </g>
    </svg>
  );
}
