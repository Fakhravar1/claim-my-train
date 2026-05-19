export default function VasttrafikSignup() {
  return (
    <svg viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="vt-signup-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E8F2FB" stopOpacity="0" />
          <stop offset="1" stopColor="#B0D6F0" />
        </linearGradient>
      </defs>
      <rect width="1440" height="320" fill="url(#vt-signup-sky)" />
      <g fill="#3F5670" opacity="0.7">
        <rect x="220" y="160" width="6" height="80" />
        <polygon points="220,160 320,160 326,154 220,154" />
        <rect x="320" y="160" width="2" height="36" />
      </g>
      <g fill="#3F5670" opacity="0.55">
        <rect x="1090" y="180" width="5" height="60" />
        <polygon points="1090,180 1180,180 1186,176 1090,176" />
      </g>
      <rect x="0" y="240" width="1440" height="80" fill="#2E5A8C" />
      <g stroke="#1B4E8B" strokeWidth={1.5} fill="none" opacity="0.55">
        <path d="M0,270 Q280,266 560,270 T1120,270 T1440,270" />
        <path d="M0,296 Q280,292 560,296 T1120,296 T1440,296" />
      </g>
      <g transform="translate(580, 200)">
        <rect x="0" y="0" width="180" height="34" rx="5" fill="#1B4E8B" />
        <rect x="180" y="2" width="20" height="32" rx="4" fill="#143A6B" />
        <rect x="0" y="20" width="200" height="3" fill="#FFFFFF" />
        <g fill="#D8EAF8">
          {[6, 24, 42, 60, 78, 96, 114, 132, 150].map((x) => (
            <rect key={x} x={x} y="6" width="14" height="9" rx="2" />
          ))}
        </g>
      </g>
    </svg>
  );
}
