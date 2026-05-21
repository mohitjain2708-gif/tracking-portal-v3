export default function StatCard({ label, value, onClick, helperText, motionIndex = 0 }) {
  const Element = onClick ? "button" : "article";
  return (
    <Element
      className={`stat-card motion-stagger-item ${onClick ? "stat-card-interactive" : ""}`}
      onClick={onClick}
      type={onClick ? "button" : undefined}
      style={{ "--motion-index": motionIndex }}
    >
      <p className="stat-label">{label}</p>
      <strong className="stat-value">{value}</strong>
      {helperText ? <span className="stat-helper">{helperText}</span> : null}
    </Element>
  );
}

