export default function IntakeLauncherCard({ eyebrow, title, description, isActive, onClick, motionIndex = 0 }) {
  return (
    <button
      type="button"
      className={`intake-launcher-card motion-stagger-item${isActive ? " is-active" : ""}`}
      onClick={onClick}
      style={{ "--motion-index": motionIndex }}
    >
      <span className="eyebrow">{eyebrow}</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </button>
  );
}

