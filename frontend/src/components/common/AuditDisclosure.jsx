import ActionButton from "./ActionButton";

export default function AuditDisclosure({ title, summary = "", open = false, onToggle, children }) {
  return (
    <section className={`audit-disclosure-card${open ? " is-open" : ""}`}>
      <div className="audit-disclosure-header">
        <div className="audit-disclosure-copy">
          <p className="audit-detail-title">{title}</p>
          {summary ? <p className="audit-disclosure-summary">{summary}</p> : null}
        </div>
        <ActionButton type="button" tone="secondary" compact onClick={onToggle}>
          {open ? "Hide" : "Show"}
        </ActionButton>
      </div>
      {open ? <div className="audit-disclosure-body">{children}</div> : null}
    </section>
  );
}

