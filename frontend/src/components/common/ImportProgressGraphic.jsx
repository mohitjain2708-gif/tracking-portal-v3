export default function ImportProgressGraphic({ completed = false }) {
  return (
    <div className="import-progress-visual" aria-hidden="true">
      <svg
        className="import-progress-graphic import-progress-graphic-light"
        viewBox="0 0 720 220"
        role="img"
        focusable="false"
      >
        <defs>
          <linearGradient id="importSurface" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EEF4FB" />
            <stop offset="100%" stopColor="#E3EBF5" />
          </linearGradient>
          <linearGradient id="excelPanel" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#33C66A" />
            <stop offset="100%" stopColor="#14984A" />
          </linearGradient>
          <linearGradient id="portalPanel" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#68CAFF" />
            <stop offset="100%" stopColor="#2F6DD8" />
          </linearGradient>
          <filter id="dotGlowLight" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="8" y="8" width="704" height="204" rx="28" fill="url(#importSurface)" />
        <rect x="8" y="8" width="704" height="204" rx="28" fill="none" stroke="#D2DEEA" />

        <g transform="translate(66 72)">
          <rect x="0" y="0" width="108" height="92" rx="24" fill="url(#excelPanel)" />
          <rect x="36" y="26" width="38" height="48" rx="12" fill="#F9FCF9" opacity="0.97" />
          <path d="M45 38L65 62M65 38L45 62" stroke="#14994A" strokeWidth="7" strokeLinecap="round" />
        </g>

        <g transform="translate(546 72)">
          <rect x="0" y="0" width="120" height="92" rx="28" fill="url(#portalPanel)" />
          <rect x="33" y="20" width="54" height="52" rx="16" fill="#FAFCFF" opacity="0.98" />
          <rect x="42" y="30" width="36" height="14" rx="7" fill="#CDD9EF" />
          <circle cx="54" cy="51" r="8" fill="#4C70D6" />
          <path d="M63 51H83" stroke="#A8BBE8" strokeWidth="6" strokeLinecap="round" />
        </g>

        <path
          d="M212 118H520"
          stroke="#7C98B8"
          strokeWidth="4"
          strokeDasharray="2 18"
          strokeLinecap="round"
        />

        <g filter="url(#dotGlowLight)">
          <circle className={`import-progress-dot import-progress-dot-1${completed ? " is-complete" : ""}`} cx="316" cy="118" r="12" fill="#74BCFF" />
          <circle className={`import-progress-dot import-progress-dot-2${completed ? " is-complete" : ""}`} cx="396" cy="114" r="12" fill="#74BCFF" />
          <circle className={`import-progress-dot import-progress-dot-3${completed ? " is-complete" : ""}`} cx="476" cy="118" r="12" fill="#74BCFF" />
        </g>
      </svg>
    </div>
  );
}
