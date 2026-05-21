export default function ActionButton({ children, tone = "default", compact = false, ...props }) {
  return (
    <button className={`button button-${tone}${compact ? " button-compact" : ""}`} {...props}>
      {children}
    </button>
  );
}

