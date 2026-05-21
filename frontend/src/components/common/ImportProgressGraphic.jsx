export default function ImportProgressGraphic() {
  return (
    <div className="import-progress-visual" aria-hidden="true">
      <svg
        className="import-progress-graphic"
        viewBox="0 0 720 240"
        role="img"
        focusable="false"
      >
        <defs>
          <linearGradient id="importProgressPanel" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#101a28" />
            <stop offset="100%" stopColor="#17263a" />
          </linearGradient>
          <linearGradient id="importProgressLine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(95, 129, 174, 0.26)" />
            <stop offset="100%" stopColor="rgba(95, 129, 174, 0.58)" />
          </linearGradient>
          <linearGradient id="importProgressGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#55b6ff" />
            <stop offset="100%" stopColor="#a5ddff" />
          </linearGradient>
          <linearGradient id="excelIcon" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#31c36a" />
            <stop offset="100%" stopColor="#0f8d43" />
          </linearGradient>
          <linearGradient id="portalIcon" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4ec2ff" />
            <stop offset="100%" stopColor="#2457c9" />
          </linearGradient>
          <filter id="importGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="8" y="8" width="704" height="224" rx="28" fill="url(#importProgressPanel)" />
        <rect x="8" y="8" width="704" height="224" rx="28" fill="none" stroke="rgba(255,255,255,0.08)" />

        <g transform="translate(56 52)">
          <rect x="0" y="0" width="108" height="132" rx="24" fill="url(#excelIcon)" />
          <rect x="22" y="22" width="64" height="88" rx="16" fill="rgba(8, 29, 17, 0.24)" />
          <rect x="36" y="36" width="36" height="60" rx="10" fill="rgba(255,255,255,0.88)" />
          <path
            d="M45 50 L63 82 M63 50 L45 82"
            stroke="#19a64f"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M72 36 L86 50 L86 96"
            fill="none"
            stroke="rgba(255,255,255,0.34)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        <g transform="translate(548 52)">
          <rect x="0" y="0" width="120" height="132" rx="28" fill="url(#portalIcon)" />
          <rect x="18" y="20" width="84" height="92" rx="20" fill="rgba(255,255,255,0.94)" />
          <rect x="26" y="30" width="68" height="18" rx="9" fill="rgba(36, 87, 201, 0.18)" />
          <rect x="26" y="58" width="46" height="34" rx="12" fill="rgba(36, 87, 201, 0.12)" />
          <rect x="78" y="58" width="16" height="34" rx="8" fill="rgba(36, 87, 201, 0.2)" />
          <circle cx="44" cy="75" r="8" fill="rgba(36, 87, 201, 0.8)" />
          <path
            d="M52 76 H86"
            stroke="rgba(36, 87, 201, 0.34)"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </g>

        <path
          d="M196 118 H526"
          stroke="url(#importProgressLine)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="1 18"
        />

        <g filter="url(#importGlow)">
          <circle className="import-progress-dot import-progress-dot-1" cx="260" cy="118" r="10" fill="url(#importProgressGlow)" />
          <circle className="import-progress-dot import-progress-dot-2" cx="334" cy="118" r="9" fill="url(#importProgressGlow)" />
          <circle className="import-progress-dot import-progress-dot-3" cx="410" cy="118" r="8" fill="url(#importProgressGlow)" />
          <circle className="import-progress-dot import-progress-dot-4" cx="486" cy="118" r="7" fill="url(#importProgressGlow)" />
        </g>
      </svg>
    </div>
  );
}
