export default function SectionHeader({ eyebrow, title, description, actions = null, className = "compact-heading" }) {
  return (
    <div className={`panel-heading ${className}`.trim()}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p className="panel-copy">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

