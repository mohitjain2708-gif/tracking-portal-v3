import ActionButton from "../../../components/common/ActionButton";
import AuditDisclosure from "../../../components/common/AuditDisclosure";
import ContainerChipList from "../../../components/common/ContainerChipList";
import Modal from "../../../components/common/Modal";
import {
  cleanText,
  exportRowsAsCsv,
  formatAuditActionLabel,
  formatAuditDetails,
  formatDocumentStatusSummary,
  formatLocationLabel,
  formatRefreshStatusLabel,
  formatShipmentDetailSummary,
  formatShipmentStatusLabel,
  formatTrackingSourceLabel,
} from "../../../lib/portalUtils";
import { DOCUMENT_STATUS_OPTIONS } from "../../../constants/portalConstants";

export default function ShipmentDetailModal({
  auditRow,
  setAuditRow,
  setActionReturnRow,
  setActionRow,
  badgeClass,
  relatedCycleRows,
  auditRelatedCyclesExpanded,
  setAuditRelatedCyclesExpanded,
  auditJournalExpanded,
  setAuditJournalExpanded,
  auditEntries,
  getOperationalDraft,
  setOperationalDraftValue,
  fieldSavingKeys,
  handleOperationalFieldSave,
  saveDoDateDraft,
  saveDocumentDraft,
  auditControlsExpanded,
  setAuditControlsExpanded,
  handleRefreshGroup,
}) {
  if (!auditRow) {
    return null;
  }

  return (
    <Modal
      title={`Shipment Detail${auditRow.bl_number ? ` - ${auditRow.bl_number}` : ` - ${auditRow.primary_container_number}`}`}
      onClose={() => setAuditRow(null)}
      size="wide"
      actions={
        <>
          <ActionButton
            type="button"
            tone="ghost"
            onClick={async () => {
              await handleRefreshGroup(auditRow);
            }}
          >
            Refresh Shipment
          </ActionButton>
          <ActionButton
            type="button"
            tone="secondary"
            onClick={() => {
              setActionReturnRow(auditRow);
              setActionRow(auditRow);
              setAuditRow(null);
            }}
          >
            Manage
          </ActionButton>
        </>
      }
    >
      <div className="audit-panel">
        <div className="audit-hero">
          <section className="audit-hero-primary">
            <span className="audit-detail-title">Customer</span>
            <h4>{auditRow.customer_name || "-"}</h4>
            <p className="audit-hero-summary">{formatShipmentDetailSummary(auditRow)}</p>
            <div className="audit-hero-meta">
              <span className={badgeClass("movement", auditRow.movement_category || "Hi Seas")}>
                {auditRow.movement_category || "Hi Seas"}
              </span>
              <span className="meta-pill">
                {auditRow.container_numbers?.length || (auditRow.primary_container_number ? 1 : 0)} container
                {(auditRow.container_numbers?.length || (auditRow.primary_container_number ? 1 : 0)) === 1 ? "" : "s"}
              </span>
            </div>
          </section>

          <section className="audit-summary-card">
            <div className="audit-summary-cluster">
              <div className="audit-summary-row">
                <span>Last Updated</span>
                <strong>{auditRow.last_refresh_at ? auditRow.last_refresh_at : "No refresh yet"}</strong>
              </div>
              <div className="audit-summary-row">
                <span>Refresh Status</span>
                <strong>{formatRefreshStatusLabel(auditRow.last_refresh_status)}</strong>
              </div>
            </div>
            <div className="audit-summary-cluster">
              <div className="audit-summary-row">
                <span>BL Number</span>
                <strong>{auditRow.bl_number || "Not linked"}</strong>
              </div>
              <div className="audit-summary-row">
                <span>Sources</span>
                <strong>{formatTrackingSourceLabel(auditRow.tracking_source)}</strong>
              </div>
            </div>
            <div className="audit-summary-cluster">
              <div className="audit-summary-row">
                <span>Document Status</span>
                <strong>{formatDocumentStatusSummary(auditRow)}</strong>
              </div>
              <div className="audit-summary-row">
                <span>DO Date</span>
                <strong>{auditRow.do_date || "Not set"}</strong>
              </div>
            </div>
            {auditRow.last_refresh_error ? (
              <div className="confirm-warning audit-summary-warning">
                Latest check note: <strong>{auditRow.last_refresh_error}</strong>
              </div>
            ) : null}
          </section>
        </div>

        <div className="audit-overview-grid">
          <article className="audit-overview-card">
            <span>Latest Location</span>
            <strong>{formatLocationLabel(auditRow.latest_location) || "Awaiting live location"}</strong>
          </article>
          <article className="audit-overview-card">
            <span>Movement Since</span>
            <strong>{auditRow.movement_since_date || auditRow.latest_time || "-"}</strong>
          </article>
          <article className="audit-overview-card">
            <span>Port Arrival</span>
            <strong>{auditRow.port_arrival_date || "Not confirmed"}</strong>
          </article>
          <article className="audit-overview-card">
            <span>Rail</span>
            <strong>{auditRow.train_no || auditRow.departure || "Not linked yet"}</strong>
          </article>
        </div>

        <div className="audit-main-layout">
          <section className="audit-detail-card audit-snapshot-card">
            <div className="audit-card-head">
              <p className="audit-detail-title">Shipment</p>
            </div>
            <div className="audit-kv-grid">
              <div>
                <span>BL Number</span>
                <strong>{auditRow.bl_number || "Not linked"}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{formatShipmentStatusLabel(auditRow.shipment_status || "active")}</strong>
              </div>
              <div>
                <span>Latest Activity</span>
                <strong>{auditRow.latest_time || "-"}</strong>
              </div>
              <div>
                <span>Sources</span>
                <strong>{formatTrackingSourceLabel(auditRow.tracking_source)}</strong>
              </div>
              {["completed", "archived"].includes(cleanText(auditRow.shipment_status).toLowerCase()) ? (
                <label className="audit-field">
                  <span>Clearance Doc</span>
                  <div className="inline-field-stack">
                    <input
                      className="inline-field-control"
                      value={getOperationalDraft(auditRow).clearance_doc_number || auditRow.clearance_doc_number || ""}
                      onChange={(event) =>
                        setOperationalDraftValue(auditRow, {
                          clearance_doc_number: event.target.value.toUpperCase(),
                        })
                      }
                      placeholder="Enter clearance number"
                    />
                    <ActionButton
                      type="button"
                      tone="ghost"
                      compact
                      disabled={Boolean(fieldSavingKeys[`${auditRow.group_key}:clearance_doc_number`])}
                      onClick={async () => {
                        const draft = getOperationalDraft(auditRow);
                        await handleOperationalFieldSave(auditRow, {
                          clearance_doc_number: cleanText(draft.clearance_doc_number ?? auditRow.clearance_doc_number).toUpperCase(),
                        });
                      }}
                    >
                      {fieldSavingKeys[`${auditRow.group_key}:clearance_doc_number`] ? "Saving..." : "Save"}
                    </ActionButton>
                  </div>
                </label>
              ) : null}
            </div>
            <div className="audit-snapshot-row">
              <div className="audit-kv-block audit-kv-block-compact">
                <span>Container</span>
                <ContainerChipList row={auditRow} expanded showOverflowHint={false} className="audit-container-chips" />
              </div>
              <dl className="audit-snapshot-facts audit-snapshot-facts-inline">
                <div>
                  <dt>Departure</dt>
                  <dd>{auditRow.departure || "-"}</dd>
                </div>
                <div>
                  <dt>Train</dt>
                  <dd>{auditRow.train_no || "-"}</dd>
                </div>
                <div>
                  <dt>Refresh</dt>
                  <dd>{formatRefreshStatusLabel(auditRow.last_refresh_status)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="audit-detail-card audit-operations-card">
            <div className="audit-card-head">
              <p className="audit-detail-title">Documents</p>
            </div>
            <dl className="audit-operations-summary">
              <div>
                <dt>DO Date</dt>
                <dd>{auditRow.do_date || "Not set"}</dd>
              </div>
              <div>
                <dt>Document Status</dt>
                <dd>{formatDocumentStatusSummary(auditRow) || "Not set"}</dd>
              </div>
              {cleanText(auditRow.clearance_doc_number) ? (
                <div>
                  <dt>Clearance Doc</dt>
                  <dd>{auditRow.clearance_doc_number}</dd>
                </div>
              ) : null}
            </dl>
            <div className="audit-card-actions audit-card-actions-split">
              <ActionButton type="button" tone="ghost" compact onClick={() => setAuditControlsExpanded((current) => !current)}>
                {auditControlsExpanded ? "Done" : "Edit"}
              </ActionButton>
            </div>
            {auditControlsExpanded ? (
              <div className="audit-controls-editor">
                <div className="audit-form-grid">
                  <label className="audit-field">
                    <span>DO Date</span>
                    <input
                      className="inline-field-control"
                      type="date"
                      value={getOperationalDraft(auditRow).do_date}
                      onChange={(event) => setOperationalDraftValue(auditRow, { do_date: event.target.value })}
                    />
                  </label>
                  <label className="audit-field">
                    <span>Document Status</span>
                    <select
                      className="inline-field-control"
                      value={getOperationalDraft(auditRow).document_status}
                      onChange={(event) =>
                        setOperationalDraftValue(auditRow, {
                          document_status: event.target.value,
                          original_docs_received_date:
                            event.target.value === "Original"
                              ? getOperationalDraft(auditRow).original_docs_received_date
                              : "",
                        })
                      }
                    >
                      {DOCUMENT_STATUS_OPTIONS.map((option) => (
                        <option key={option || "empty"} value={option}>
                          {option || "Select"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {getOperationalDraft(auditRow).document_status === "Original" ? (
                    <label className="audit-field">
                      <span>Original Received</span>
                      <input
                        className="inline-field-control"
                        type="date"
                        value={getOperationalDraft(auditRow).original_docs_received_date}
                        onChange={(event) => setOperationalDraftValue(auditRow, { original_docs_received_date: event.target.value })}
                      />
                    </label>
                  ) : null}
                </div>
                <div className="audit-card-actions">
                  <ActionButton
                    type="button"
                    tone="ghost"
                    compact
                    disabled={Boolean(fieldSavingKeys[`${auditRow.group_key}:do_date`])}
                    onClick={async () => {
                      await saveDoDateDraft(auditRow);
                    }}
                  >
                    {fieldSavingKeys[`${auditRow.group_key}:do_date`] ? "Saving..." : "Save DO Date"}
                  </ActionButton>
                  <ActionButton
                    type="button"
                    tone="ghost"
                    compact
                    disabled={Boolean(fieldSavingKeys[`${auditRow.group_key}:document_status|original_docs_received_date`])}
                    onClick={async () => {
                      await saveDocumentDraft(auditRow);
                    }}
                  >
                    {fieldSavingKeys[`${auditRow.group_key}:document_status|original_docs_received_date`] ? "Saving..." : "Save Document Status"}
                  </ActionButton>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <div className="audit-secondary-stack">
          {relatedCycleRows.length ? (
            <AuditDisclosure
              title="Related Container Cycles"
              summary={`${relatedCycleRows.length} other shipment cycle${relatedCycleRows.length === 1 ? " uses" : "s use"} the same physical container.`}
              open={auditRelatedCyclesExpanded}
              onToggle={() => setAuditRelatedCyclesExpanded((current) => !current)}
            >
              <div className="related-cycle-list">
                {relatedCycleRows.map((row) => (
                  <article key={row.group_key} className="related-cycle-item">
                    <div className="related-cycle-copy">
                      <div className="related-cycle-meta">
                        <span className={badgeClass("movement", row.movement_category || "Hi Seas")}>
                          {row.movement_category || "Hi Seas"}
                        </span>
                        <span className="meta-pill">{formatShipmentStatusLabel(row.shipment_status || "active")}</span>
                      </div>
                      <h4>{row.customer_name || "Shipment group"}</h4>
                      <div className="related-cycle-facts">
                        <span>{row.bl_number ? `BL ${row.bl_number}` : "BL not linked"}</span>
                        <span>{(row.container_numbers || []).join(", ") || row.primary_container_number || "-"}</span>
                        <span>{row.movement_since_date || row.latest_time || "-"}</span>
                      </div>
                    </div>
                    <ActionButton type="button" tone="ghost" onClick={() => setAuditRow(row)}>
                      Open
                    </ActionButton>
                  </article>
                ))}
              </div>
            </AuditDisclosure>
          ) : null}

          <AuditDisclosure
            title="Activity"
            summary={auditEntries.length ? `Latest update: ${formatAuditActionLabel(auditEntries[0]?.action)}` : "No activity has been recorded for this shipment group yet."}
            open={auditJournalExpanded}
            onToggle={() => setAuditJournalExpanded((current) => !current)}
          >
            <div className="preview-actions audit-journal-tools">
              {auditEntries.length ? (
                <ActionButton
                  type="button"
                  tone="secondary"
                  onClick={() =>
                    exportRowsAsCsv("shipment-audit.csv", auditEntries, [
                      { label: "Created At", value: (row) => row.created_at },
                      { label: "Action", value: (row) => row.action },
                      { label: "BL", value: (row) => row.bl_number },
                      { label: "Container", value: (row) => row.container_number },
                      { label: "Status", value: (row) => row.shipment_status },
                      { label: "Details", value: (row) => JSON.stringify(row.details || {}) },
                    ])
                  }
                >
                  Download
                </ActionButton>
              ) : null}
            </div>
            <div className={`audit-journal-body ${auditJournalExpanded ? "is-expanded" : "is-collapsed"}`}>
              {auditEntries.length === 0 ? (
                <div className="history-table-wrap empty-state-panel">No activity yet.</div>
              ) : (
                <div className="audit-timeline motion-detail-list">
                  {auditEntries.map((entry, index) => (
                    <article key={entry.id} className="audit-timeline-item motion-stagger-item" style={{ "--motion-index": index }}>
                      <div className="audit-timeline-meta">
                        <span>{entry.created_at || "-"}</span>
                        <span>{formatShipmentStatusLabel(entry.shipment_status)}</span>
                      </div>
                      <h4>{formatAuditActionLabel(entry.action)}</h4>
                      <p>{formatAuditDetails(entry.details)}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </AuditDisclosure>
        </div>
      </div>
    </Modal>
  );
}

