export default function VasttrafikHero() {
  return (
    <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" role="img">
      <defs>
        <linearGradient id="vt-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E8F2FB" />
          <stop offset="0.55" stopColor="#D8EAF8" />
          <stop offset="1" stopColor="#B0D6F0" />
        </linearGradient>
      </defs>
      <rect width="1440" height="900" fill="url(#vt-sky)" />
      <g fill="#FFFFFF">
        <g>
          <circle cx="180" cy="180" r="36" />
          <circle cx="226" cy="158" r="48" />
          <circle cx="282" cy="166" r="42" />
          <circle cx="320" cy="184" r="34" />
        </g>
        <g opacity="0.92">
          <circle cx="780" cy="220" r="30" />
          <circle cx="820" cy="200" r="40" />
          <circle cx="868" cy="220" r="32" />
        </g>
        <g opacity="0.85">
          <circle cx="1180" cy="160" r="28" />
          <circle cx="1220" cy="146" r="36" />
          <circle cx="1262" cy="160" r="28" />
        </g>
      </g>
      <g stroke="#0E2748" strokeWidth={3} fill="none" strokeLinecap="round" opacity="0.75">
        <path d="M540 240 q11 -8 22 0 q11 -8 22 0" />
        <path d="M620 290 q9 -7 18 0 q9 -7 18 0" />
        <path d="M490 320 q8 -6 16 0 q8 -6 16 0" />
        <path d="M970 280 q9 -7 18 0 q9 -7 18 0" />
        <path d="M1050 340 q7 -5 14 0 q7 -5 14 0" />
      </g>
      <g fill="#3F5670">
        <rect x="200" y="380" width="14" height="240" />
        <polygon points="200,380 460,380 480,360 200,360" />
        <rect x="186" y="354" width="22" height="20" />
        <g stroke="#3F5670" strokeWidth={2} fill="none">
          <line x1="200" y1="360" x2="280" y2="320" />
          <line x1="280" y1="320" x2="460" y2="360" />
        </g>
        <rect x="455" y="380" width="4" height="100" />
        <rect x="446" y="476" width="22" height="12" />
      </g>
      <g fill="#3F5670" opacity="0.7">
        <rect x="1180" y="420" width="10" height="180" />
        <polygon points="1180,420 1350,420 1364,406 1180,406" />
        <rect x="1170" y="402" width="14" height="14" />
        <rect x="1348" y="420" width="3" height="80" />
      </g>
      <path d="M0,540 L1440,540 L1440,570 L0,570 Z" fill="#5E8CB8" opacity="0.4" />
      <rect x="0" y="570" width="1440" height="330" fill="#2E5A8C" />
      <g stroke="#1B4E8B" strokeWidth={2.4} fill="none" opacity="0.55">
        <path d="M0,620 Q200,614 400,620 T800,620 T1200,620 T1440,620" />
        <path d="M0,680 Q220,672 440,680 T880,680 T1320,680 T1440,680" />
        <path d="M0,740 Q240,730 480,740 T960,740 T1440,740" />
        <path d="M0,810 Q260,802 520,810 T1040,810 T1440,810" />
      </g>
      <g transform="translate(900, 690)">
        <path d="M0,12 L60,12 L54,28 L6,28 Z" fill="#FFFFFF" />
        <rect x="16" y="0" width="32" height="12" fill="#FFFFFF" />
        <rect x="20" y="2" width="5" height="6" fill="#3F5670" />
        <rect x="29" y="2" width="5" height="6" fill="#3F5670" />
        <rect x="38" y="2" width="5" height="6" fill="#3F5670" />
        <rect x="32" y="-12" width="3" height="14" fill="#D14B3C" />
      </g>
      <g transform="translate(420, 760)">
        <rect x="0" y="0" width="180" height="36" rx="6" fill="#1B4E8B" />
        <rect x="180" y="2" width="22" height="34" rx="5" fill="#143A6B" />
        <rect x="0" y="20" width="202" height="4" fill="#FFFFFF" />
        <g fill="#D8EAF8">
          {[6, 24, 42, 60, 78, 96, 114, 132, 150, 168].map((x) => (
            <rect key={x} x={x} y="6" width="14" height="10" rx="2" />
          ))}
        </g>
        <circle cx="195" cy="28" r="3" fill="#D14B3C" />
      </g>
    </svg>
  );
}
