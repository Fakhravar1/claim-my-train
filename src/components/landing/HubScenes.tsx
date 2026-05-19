/** Hero scene: Tuscany morning with sunflowers, distant train. */
export function HubHeroScene() {
  // Sunflower glyph reused 8 times — defined once in <defs>, instantiated via <use>.
  return (
    <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" role="img">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFCF2" />
          <stop offset="0.55" stopColor="#F4F8EC" />
          <stop offset="1" stopColor="#E9F1D6" />
        </linearGradient>
        <radialGradient id="sunglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F4D35E" stopOpacity="0.7" />
          <stop offset="1" stopColor="#F4D35E" stopOpacity="0" />
        </radialGradient>

        <g id="sunflower">
          <rect x="-2.5" y="0" width="5" height="74" rx="2" fill="#5C8E3B" />
          <path d="M0,42 Q-22,46 -28,30 Q-10,30 0,42 Z" fill="#7FB069" />
          <path d="M0,58 Q22,62 28,46 Q10,46 0,58 Z" fill="#5C8E3B" />
          <g>
            <ellipse cx="0" cy="-26" rx="9" ry="18" fill="#F4D35E" />
            <ellipse cx="0" cy="-26" rx="9" ry="18" fill="#E2B33A" transform="rotate(30)" />
            <ellipse cx="0" cy="-26" rx="9" ry="18" fill="#F4D35E" transform="rotate(60)" />
            <ellipse cx="0" cy="-26" rx="9" ry="18" fill="#E2B33A" transform="rotate(90)" />
            <ellipse cx="0" cy="-26" rx="9" ry="18" fill="#F4D35E" transform="rotate(120)" />
            <ellipse cx="0" cy="-26" rx="9" ry="18" fill="#E2B33A" transform="rotate(150)" />
            <ellipse cx="0" cy="-26" rx="9" ry="18" fill="#F4D35E" transform="rotate(180)" />
            <ellipse cx="0" cy="-26" rx="9" ry="18" fill="#E2B33A" transform="rotate(210)" />
            <ellipse cx="0" cy="-26" rx="9" ry="18" fill="#F4D35E" transform="rotate(240)" />
            <ellipse cx="0" cy="-26" rx="9" ry="18" fill="#E2B33A" transform="rotate(270)" />
            <ellipse cx="0" cy="-26" rx="9" ry="18" fill="#F4D35E" transform="rotate(300)" />
            <ellipse cx="0" cy="-26" rx="9" ry="18" fill="#E2B33A" transform="rotate(330)" />
          </g>
          <circle r="13" fill="#5C3D14" />
          <circle r="9" fill="#3A2607" />
          <circle r="3" cx="-2" cy="-3" fill="#5C3D14" opacity="0.6" />
        </g>

        <g id="distantTrain">
          <rect x="0" y="0" width="56" height="14" rx="3" fill="#1F6F4A" />
          <path d="M56,0 L70,4 L70,14 L56,14 Z" fill="#154E34" />
          <rect x="3" y="3" width="6" height="5" rx="1" fill="#EFF6E6" />
          <rect x="13" y="3" width="6" height="5" rx="1" fill="#EFF6E6" />
          <rect x="23" y="3" width="6" height="5" rx="1" fill="#EFF6E6" />
          <rect x="33" y="3" width="6" height="5" rx="1" fill="#EFF6E6" />
          <rect x="43" y="3" width="6" height="5" rx="1" fill="#EFF6E6" />
          <rect x="0" y="9" width="70" height="1.6" fill="#F4D35E" />
        </g>
      </defs>

      <rect width="1440" height="900" fill="url(#sky)" />
      <circle cx="1180" cy="220" r="170" fill="url(#sunglow)" />
      <circle cx="1180" cy="220" r="62" fill="#F4D35E" />
      <circle cx="1180" cy="220" r="62" fill="#FFFCF2" opacity="0.18" />
      <g stroke="#2C3E32" strokeWidth={2.4} fill="none" strokeLinecap="round" opacity="0.7">
        <path d="M1020 260 q9 -7 18 0 q9 -7 18 0" />
        <path d="M1090 310 q7 -5 14 0 q7 -5 14 0" />
        <path d="M970 340 q6 -4 12 0 q6 -4 12 0" />
      </g>

      <path d="M0,560 C160,500 280,520 460,520 C620,520 760,490 920,500 C1080,510 1240,530 1440,520 L1440,900 L0,900 Z" fill="#E8D8B5" />
      <path d="M0,640 C220,560 360,610 580,610 C780,610 980,580 1180,600 C1320,612 1400,610 1440,610 L1440,900 L0,900 Z" fill="#C2D8B0" />
      <g fill="#FCFCF8">
        <rect x="870" y="568" width="6" height="6" />
        <polygon points="869,568 879,568 874,562" />
        <rect x="878" y="572" width="4" height="3" />
      </g>

      <g>
        <ellipse cx="280" cy="612" rx="10" ry="52" fill="#1F6F4A" />
        <ellipse cx="306" cy="618" rx="8" ry="42" fill="#154E34" />
        <ellipse cx="328" cy="614" rx="10" ry="48" fill="#1F6F4A" />
        <ellipse cx="780" cy="588" rx="10" ry="52" fill="#1F6F4A" />
        <ellipse cx="804" cy="594" rx="7" ry="38" fill="#154E34" />
        <ellipse cx="826" cy="592" rx="9" ry="44" fill="#1F6F4A" />
        <ellipse cx="1090" cy="608" rx="10" ry="50" fill="#1F6F4A" />
        <ellipse cx="1110" cy="614" rx="6" ry="34" fill="#154E34" />
      </g>

      <line x1="0" y1="660" x2="1440" y2="660" stroke="#5C8E3B" strokeWidth={2} strokeDasharray="6 6" opacity="0.7" />
      <g transform="translate(960, 646)">
        <use href="#distantTrain" />
      </g>
      <g transform="translate(950, 626)" opacity="0.5">
        <circle cx="0" cy="0" r="4" fill="#FFFCF2" />
        <circle cx="-7" cy="-6" r="6" fill="#FFFCF2" />
        <circle cx="-16" cy="-12" r="8" fill="#FFFCF2" />
      </g>

      <path d="M0,760 C200,700 380,740 560,740 C720,740 880,720 1060,730 C1240,740 1380,760 1440,750 L1440,900 L0,900 Z" fill="#7FB069" />
      <path d="M0,830 C260,790 540,820 760,810 C980,800 1240,820 1440,810 L1440,900 L0,900 Z" fill="#3B7A5A" />

      <g transform="translate(140, 820)"><use href="#sunflower" /></g>
      <g transform="translate(220, 832)" opacity="0.95"><use href="#sunflower" /></g>
      <g transform="translate(330, 824)"><use href="#sunflower" /></g>
      <g transform="translate(420, 836)" opacity="0.9"><use href="#sunflower" /></g>
      <g transform="translate(1080, 832)"><use href="#sunflower" /></g>
      <g transform="translate(1170, 822)"><use href="#sunflower" /></g>
      <g transform="translate(1260, 834)" opacity="0.95"><use href="#sunflower" /></g>
      <g transform="translate(1340, 826)"><use href="#sunflower" /></g>
    </svg>
  );
}

/** Hub signup scene: warm low sun, parked green train. */
export function HubSignupScene() {
  return (
    <svg viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="signupSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFCF2" stopOpacity="0" />
          <stop offset="1" stopColor="#F4F8EC" />
        </linearGradient>
      </defs>
      <rect width="1440" height="320" fill="url(#signupSky)" />
      <path d="M0,200 Q300,150 700,180 T1440,170 L1440,320 L0,320 Z" fill="#C2D8B0" />
      <path d="M0,240 Q360,200 720,230 T1440,225 L1440,320 L0,320 Z" fill="#7FB069" />
      <path d="M0,280 Q400,260 820,275 T1440,270 L1440,320 L0,320 Z" fill="#3B7A5A" />
      <line x1="0" y1="298" x2="1440" y2="298" stroke="#1F6F4A" strokeWidth={2} strokeDasharray="8 6" opacity="0.5" />
      <g>
        <ellipse cx="220" cy="232" rx="8" ry="36" fill="#1F6F4A" />
        <ellipse cx="244" cy="240" rx="6" ry="28" fill="#154E34" />
        <ellipse cx="980" cy="230" rx="9" ry="40" fill="#1F6F4A" />
        <ellipse cx="1004" cy="236" rx="6" ry="30" fill="#154E34" />
      </g>
      <circle cx="1180" cy="120" r="44" fill="#F4D35E" opacity="0.7" />
      <circle cx="1180" cy="120" r="28" fill="#E2B33A" opacity="0.6" />
      <g transform="translate(620, 280)">
        <rect x="0" y="0" width="80" height="16" rx="3" fill="#1F6F4A" />
        <path d="M80,0 L96,5 L96,16 L80,16 Z" fill="#154E34" />
        <rect x="3" y="3" width="8" height="6" rx="1" fill="#FCFCF8" />
        <rect x="15" y="3" width="8" height="6" rx="1" fill="#FCFCF8" />
        <rect x="27" y="3" width="8" height="6" rx="1" fill="#FCFCF8" />
        <rect x="39" y="3" width="8" height="6" rx="1" fill="#FCFCF8" />
        <rect x="51" y="3" width="8" height="6" rx="1" fill="#FCFCF8" />
        <rect x="63" y="3" width="8" height="6" rx="1" fill="#FCFCF8" />
        <rect x="0" y="11" width="96" height="2" fill="#F4D35E" />
        <circle cx="14" cy="18" r="3" fill="#14241B" />
        <circle cx="34" cy="18" r="3" fill="#14241B" />
        <circle cx="54" cy="18" r="3" fill="#14241B" />
        <circle cx="74" cy="18" r="3" fill="#14241B" />
      </g>
    </svg>
  );
}

/** Hub's green travelling train + smoke (passed to TravellingVehicle). */
export function HubVehicle() {
  return (
    <>
      <rect x="2" y="12" width="86" height="32" rx="7" fill="#1F6F4A" />
      <path d="M88,12 Q110,16 114,30 L114,44 L88,44 Z" fill="#154E34" />
      <rect x="2" y="28" width="112" height="3" fill="#F4D35E" />
      <rect x="8" y="18" width="12" height="9" rx="2" fill="#EFF6E6" />
      <rect x="24" y="18" width="12" height="9" rx="2" fill="#EFF6E6" />
      <rect x="40" y="18" width="12" height="9" rx="2" fill="#EFF6E6" />
      <rect x="56" y="18" width="12" height="9" rx="2" fill="#EFF6E6" />
      <rect x="72" y="18" width="12" height="9" rx="2" fill="#EFF6E6" />
      <path d="M90,18 Q104,20 110,28 L90,28 Z" fill="#EFF6E6" />
      <g fill="#14241B">
        <circle cx="18" cy="48" r="6" />
        <circle cx="38" cy="48" r="6" />
        <circle cx="58" cy="48" r="6" />
        <circle cx="78" cy="48" r="6" />
      </g>
      <g fill="#3B7A5A">
        <circle cx="18" cy="48" r="2.6" />
        <circle cx="38" cy="48" r="2.6" />
        <circle cx="58" cy="48" r="2.6" />
        <circle cx="78" cy="48" r="2.6" />
      </g>
      <circle cx="110" cy="36" r="3" fill="#F4D35E" />
    </>
  );
}

/** Hub's smoke puff (hub-only — regions don't smoke per handoff). */
export function HubSmoke() {
  return (
    <>
      <g fill="#FCFCF8" opacity="0.9">
        <circle cx="14" cy="48" r="6" />
        <circle cx="24" cy="38" r="8" />
        <circle cx="36" cy="26" r="10" />
        <circle cx="50" cy="14" r="8" />
        <circle cx="62" cy="6" r="6" opacity="0.7" />
      </g>
      <g fill="#C2D8B0" opacity="0.7">
        <circle cx="22" cy="42" r="4" />
        <circle cx="32" cy="30" r="5" />
        <circle cx="44" cy="18" r="4" />
      </g>
    </>
  );
}
