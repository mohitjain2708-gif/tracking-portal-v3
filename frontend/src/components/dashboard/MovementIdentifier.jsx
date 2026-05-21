import MovementIcon from "./MovementIcon";

export default function MovementIdentifier({ filter, isActive, count, onClick, motionIndex = 0 }) {
  return (
    <button
      type="button"
      className={`movement-identifier motion-stagger-item ${isActive ? "is-active" : ""}`}
      onClick={onClick}
      style={{ "--motion-index": motionIndex }}
    >
      <span className="movement-identifier-icon">
        <MovementIcon type={filter.value} />
      </span>
      <span className="movement-identifier-copy">
        <strong>{filter.label}</strong>
        <span>{count}</span>
      </span>
    </button>
  );
}

