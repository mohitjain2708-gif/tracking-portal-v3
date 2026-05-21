import ActionButton from "../../../components/common/ActionButton";
import ContainerChipList from "../../../components/common/ContainerChipList";
import Modal from "../../../components/common/Modal";
import { cleanText, formatActionSummary, formatLocationLabel, formatShipmentStatusLabel } from "../../../lib/portalUtils";

export default function ManageShipmentModal({
  actionRow,
  actionReturnRow,
  closeActionModal,
  badgeClass,
  handleRefreshGroup,
  setAuditRow,
  setActionRow,
  setActionReturnRow,
  setEditReturnRow,
  openEditShipment,
  setConfirmAction,
  setFeedback,
}) {
  if (!actionRow) {
    return null;
  }

  const actionStatus = cleanText(actionRow.shipment_status).toLowerCase();
  const canActivate = ["completed", "archived"].includes(actionStatus);
  const canComplete = !["completed", "archived"].includes(actionStatus);
  const canArchive = actionStatus !== "archived";
  const reopenLabel = actionStatus === "archived" ? "Bring back to live" : "Reopen shipment";

  return (
    <Modal
      title={`Manage Shipment${actionRow.bl_number ? ` - ${actionRow.bl_number}` : ` - ${actionRow.primary_container_number}`}`}
      onClose={closeActionModal}
    >
      <div className="action-modal-shell">
        <section className="action-modal-hero action-modal-hero-balanced">
          <div className="action-modal-copy">
            <p className="action-modal-eyebrow">Manage this shipment cycle</p>
            <h4>{actionRow.customer_name || "Shipment group"}</h4>
            <div className="action-modal-chips">
              <span className={badgeClass("movement", actionRow.movement_category || "Hi Seas")}>
                {actionRow.movement_category || "Hi Seas"}
              </span>
              {formatActionSummary(actionRow) ? <span className="meta-pill meta-pill-destuffing">{formatActionSummary(actionRow)}</span> : null}
              <span className="meta-pill">
                {actionRow.container_count || actionRow.container_numbers?.length || 1} container
                {(actionRow.container_count || actionRow.container_numbers?.length || 1) === 1 ? "" : "s"}
              </span>
              <span className="meta-pill">{actionRow.bl_number ? `BL ${actionRow.bl_number}` : "BL not linked"}</span>
            </div>
            <ContainerChipList row={actionRow} expanded showOverflowHint={false} className="action-modal-container-list" />
          </div>

          <div className="action-modal-facts">
            <div className="action-fact-card">
              <span>State</span>
              <strong>{formatShipmentStatusLabel(actionRow.shipment_status || "active")}</strong>
            </div>
            <div className="action-fact-card">
              <span>Movement Since</span>
              <strong>{actionRow.movement_since_date || actionRow.latest_time || "-"}</strong>
            </div>
            <div className="action-fact-card action-fact-card-wide">
              <span>Current Location</span>
              <strong>{formatLocationLabel(actionRow.latest_location) || "Not available"}</strong>
            </div>
            {["completed", "archived"].includes(actionStatus) ? (
              <div className="action-fact-card">
                <span>Clearance Doc</span>
                <strong>{actionRow.clearance_doc_number || "Not saved"}</strong>
              </div>
            ) : null}
          </div>
        </section>

        <div className="action-modal-grid">
          <section className="action-modal-section">
            <div className="action-modal-section-head">
              <span>Inspect</span>
              <p>Refresh the tracking, open the detail view, or correct shipment information.</p>
            </div>
            <div className="action-modal-buttons action-modal-buttons-stacked">
              <ActionButton
                type="button"
                tone="secondary"
                onClick={async () => {
                  await handleRefreshGroup(actionRow);
                  closeActionModal();
                }}
              >
                Refresh Shipment
              </ActionButton>
              <ActionButton
                type="button"
                tone="ghost"
                onClick={() => {
                  setAuditRow(actionRow);
                  setActionRow(null);
                  setActionReturnRow(null);
                }}
              >
                Open Detail
              </ActionButton>
              <ActionButton
                type="button"
                tone="ghost"
                onClick={() => {
                  setEditReturnRow(actionReturnRow || actionRow);
                  openEditShipment(actionRow);
                  setActionRow(null);
                  setActionReturnRow(null);
                }}
              >
                Edit Details
              </ActionButton>
            </div>
          </section>

          <section className="action-modal-section">
            <div className="action-modal-section-head">
              <span>Shipment stage</span>
              <p>Move the shipment forward when work is complete, or reopen it if it needs to go live again.</p>
            </div>
            <div className="action-modal-buttons action-modal-buttons-stacked">
              {canActivate ? (
                <ActionButton type="button" tone="ghost" onClick={() => setConfirmAction({ type: "active", row: actionRow })}>
                  {reopenLabel}
                </ActionButton>
              ) : null}
              {canComplete ? (
                <ActionButton type="button" tone="ghost" onClick={() => setConfirmAction({ type: "completed", row: actionRow })}>
                  Mark as complete
                </ActionButton>
              ) : null}
              {canArchive ? (
                <ActionButton
                  type="button"
                  tone="ghost"
                  onClick={() => {
                    if (!cleanText(actionRow?.clearance_doc_number)) {
                      setFeedback({
                        tone: "warning",
                        text: "Move to archive only after this BL is complete and the clearance number has been saved.",
                      });
                    }
                    setConfirmAction({ type: "archived", row: actionRow });
                  }}
                >
                  Move to archive
                </ActionButton>
              ) : null}
            </div>
          </section>

          <section className="action-modal-section action-modal-section-danger action-modal-section-full">
            <div className="action-modal-section-head">
              <span>Danger Zone</span>
              <p>Delete only if this shipment cycle should no longer exist in your working record.</p>
            </div>
            <div className="action-modal-buttons action-modal-buttons-stacked">
              <ActionButton type="button" tone="danger" onClick={() => setConfirmAction({ type: "delete", row: actionRow })}>
                Delete Shipment
              </ActionButton>
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}

