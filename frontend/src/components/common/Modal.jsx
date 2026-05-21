export default function Modal({ title, onClose, children, actions = null, size = "default" }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-card modal-card-${size}`} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <div className="modal-header-actions">
            {actions}
            <button type="button" className="modal-close" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

