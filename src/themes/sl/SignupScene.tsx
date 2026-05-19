export default function SLSignup() {
  return (
    <svg viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="sl-signup-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F4F9FE" stopOpacity="0" />
          <stop offset="1" stopColor="#C8DDF0" />
        </linearGradient>
      </defs>
      <rect width="1440" height="320" fill="url(#sl-signup-sky)" />
      <path d="M0,200 Q200,170 400,190 T800,180 T1200,190 T1440,180 L1440,260 L0,260 Z" fill="#5E8CB8" opacity="0.6" />
      <rect x="0" y="240" width="1440" height="80" fill="#5E8CB8" />
      <g stroke="#3F6CA0" strokeWidth={1.5} fill="none" opacity="0.5">
        <path d="M0,270 Q240,266 480,270 T960,270 T1440,270" />
        <path d="M0,296 Q280,292 560,296 T1120,296 T1440,296" />
      </g>
      <g transform="translate(620, 234)">
        <path d="M0,10 L84,10 L76,28 L8,28 Z" fill="#FFFCEC" />
        <rect x="24" y="-2" width="36" height="12" fill="#FFFCEC" />
        <rect x="28" y="0" width="6" height="6" fill="#3F6CA0" />
        <rect x="38" y="0" width="6" height="6" fill="#3F6CA0" />
        <rect x="48" y="0" width="6" height="6" fill="#3F6CA0" />
      </g>
    </svg>
  );
}
