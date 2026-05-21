export default function Modal({
  title,
  onClose,
  children,
  actions = null,
  size = "default",
  dismissible = true,
}) {
  return (
    <div className="modal-backdrop" onClick={dismissible ? onClose : undefined}>
      <div className={`modal-card modal-card-${size}`} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <div className="modal-header-actions">
            {actions}
            {dismissible ? (
              <button type="button" className="modal-close" onClick={onClose}>
                Close
              </button>
            ) : null}
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
