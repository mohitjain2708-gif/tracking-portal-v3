import React from "react";
import ActionButton from "../../components/common/ActionButton";
import Modal from "../../components/common/Modal";
import {
  DOCUMENT_FIELDS,
  DOCUMENT_STATUS_OPTIONS,
  INITIAL_PASSWORD_FORM,
  MAPPING_FIELDS,
  MOVEMENT_FILTERS,
} from "../../constants/portalConstants";
import {
  badgeClass,
  cleanText,
  exportRowsAsCsv,
  formatLocationLabel,
  formatShipmentStatusLabel,
  hasDoDateDraftChanges,
  hasDocumentDraftChanges,
} from "../../lib/portalUtils";
import ManageShipmentModal from "./modals/ManageShipmentModal";
import ShipmentDetailModal from "./modals/ShipmentDetailModal";

export default function PortalModalLayer({
  actionRow,
  actionReturnRow,
  closeActionModal,
  handleRefreshGroup,
  setAuditRow,
  setActionRow,
  setActionReturnRow,
  setEditReturnRow,
  openEditShipment,
  setConfirmAction,
  setFeedback,
  confirmAction,
  handleGroupDelete,
  setClearancePrompt,
  setClearanceDocNumber,
  handleGroupStatusChange,
  bulkConfirmAction,
  setBulkConfirmAction,
  selectedRows,
  bulkClearanceMap,
  setBulkClearanceMap,
  setSelectedGroupKeys,
  handleBulkDelete,
  handleBulkStatusChange,
  clearancePrompt,
  clearanceDocNumber,
  rowContextMenu,
  setRowContextMenu,
  setQuickEditRow,
  quickEditRow,
  getOperationalDraft,
  setOperationalDraftValue,
  fieldSavingKeys,
  saveQuickEditDraft,
  documentRow,
  setDocumentRow,
  setDocumentFiles,
  documentFiles,
  documentUploadState,
  handleOpenDocument,
  handleDownloadDocument,
  handleDocumentSubmit,
  recordsView,
  setRecordsView,
  recordsSearch,
  setRecordsSearch,
  recordsMovementFilter,
  setRecordsMovementFilter,
  visibleHistoryRows,
  auditRow,
  relatedCycleRows,
  auditRelatedCyclesExpanded,
  setAuditRelatedCyclesExpanded,
  auditJournalExpanded,
  setAuditJournalExpanded,
  auditEntries,
  handleOperationalFieldSave,
  saveDoDateDraft,
  saveDocumentDraft,
  auditControlsExpanded,
  setAuditControlsExpanded,
  shipmentImportReviewOpen,
  setShipmentImportReviewOpen,
  shipmentImporting,
  handleImportReviewRecheck,
  shipmentImportReviewSummary,
  shipmentImportReviewRows,
  handleImportReviewFieldChange,
  shipmentImportPreview,
  shipmentImportSourceContext,
  resetShipmentImportState,
  handleShipmentImportConfirm,
  shipmentImportMapping,
  setShipmentImportMapping,
  sourceBatchDetail,
  setSourceBatchDetail,
  ownerUserShipments,
  setOwnerUserShipments,
  ownerDeleteUser,
  setOwnerDeleteUser,
  ownerDeletingUser,
  handleDeleteOwnerUser,
  editRow,
  closeEditModal,
  handleEditShipment,
  editForm,
  handleEditFieldChange,
  editSubmitting,
  currentUser,
  passwordModalOpen,
  setPasswordModalOpen,
  passwordForm,
  handlePasswordFieldChange,
  passwordSubmitting,
  handleChangePassword,
  setPasswordForm,
}) {
  const showGoogleSheetsImportModal =
    Boolean(shipmentImportPreview) && shipmentImportSourceContext?.source_type === "google_sheets";

  return (
    <>
      <ManageShipmentModal
        actionRow={actionRow}
        actionReturnRow={actionReturnRow}
        closeActionModal={closeActionModal}
        badgeClass={badgeClass}
        handleRefreshGroup={handleRefreshGroup}
        setAuditRow={setAuditRow}
        setActionRow={setActionRow}
        setActionReturnRow={setActionReturnRow}
        setEditReturnRow={setEditReturnRow}
        openEditShipment={openEditShipment}
        setConfirmAction={setConfirmAction}
        setFeedback={setFeedback}
      />

      {confirmAction && (
        <Modal title="Confirm Action" onClose={() => setConfirmAction(null)}>
          {confirmAction.type === "archived" && !cleanText(confirmAction.row?.clearance_doc_number) ? (
            <div className="confirm-warning">
              Archive is locked for this BL. Click <strong>Complete</strong> first, save the clearance document
              number, and only then archive this BL group.
            </div>
          ) : null}
          <div className="confirm-copy">
            <p>
              Are you sure you want to <strong>{confirmAction.type === "delete" ? "delete" : `mark as ${confirmAction.type}`}</strong>{" "}
              this shipment group?
            </p>
          </div>
          <div className="modal-actions">
            <ActionButton type="button" tone="ghost" onClick={() => setConfirmAction(null)}>
              Cancel
            </ActionButton>
            <ActionButton
              type="button"
              tone={confirmAction.type === "delete" ? "danger" : "primary"}
              disabled={confirmAction.type === "archived" && !cleanText(confirmAction.row?.clearance_doc_number)}
              onClick={async () => {
                const nextAction = confirmAction;
                if (!nextAction) {
                  return;
                }

                if (nextAction.type === "completed") {
                  setClearancePrompt(nextAction.row);
                  setClearanceDocNumber("");
                  setConfirmAction(null);
                  return;
                }

                setConfirmAction(null);

                if (nextAction.type === "delete") {
                  await handleGroupDelete(nextAction.row);
                  closeActionModal();
                } else {
                  await handleGroupStatusChange(nextAction.row, nextAction.type);
                }
              }}
            >
              Confirm
            </ActionButton>
          </div>
        </Modal>
      )}

      {bulkConfirmAction && (
        <Modal
          title={
            bulkConfirmAction.type === "completed"
              ? "Complete selected shipments"
              : bulkConfirmAction.type === "archived"
                ? "Archive selected shipments"
                : "Delete selected shipments"
          }
          onClose={() => setBulkConfirmAction(null)}
        >
          {bulkConfirmAction.type === "completed" ? (
            <div className="stack-form bulk-complete-flow">
              <p className="panel-copy">Confirm each shipment when its clearance document number is ready.</p>
              <div className="bulk-complete-list">
                {selectedRows.map((row) => (
                  <div key={row.group_key} className="bulk-complete-row">
                    <div className="bulk-complete-copy">
                      <strong>{row.customer_name || row.primary_container_number || "Shipment"}</strong>
                      <span>
                        {row.bl_number
                          ? `BL ${row.bl_number}`
                          : row.primary_container_number
                            ? `Container ${row.primary_container_number}`
                            : "Shipment detail"}
                      </span>
                    </div>
                    <div className="bulk-complete-actions">
                      <input
                        value={bulkClearanceMap[row.group_key] || ""}
                        onChange={(event) =>
                          setBulkClearanceMap((current) => ({
                            ...current,
                            [row.group_key]: event.target.value,
                          }))
                        }
                        placeholder="Clearance document number"
                      />
                      <ActionButton
                        type="button"
                        tone="primary"
                        onClick={async () => {
                          const clearanceDocNumber = cleanText(bulkClearanceMap[row.group_key]);
                          if (!clearanceDocNumber) {
                            setFeedback({
                              tone: "error",
                              text: `Add a clearance document number before completing ${row.customer_name || row.bl_number || "this shipment"}.`,
                            });
                            return;
                          }
                          await handleGroupStatusChange(row, "completed", {
                            clearance_doc_number: clearanceDocNumber,
                          });
                          setSelectedGroupKeys((current) => current.filter((groupKey) => groupKey !== row.group_key));
                          setBulkClearanceMap((current) => {
                            const next = { ...current };
                            delete next[row.group_key];
                            return next;
                          });
                          setFeedback({
                            tone: "success",
                            text: `${row.customer_name || row.bl_number || "Shipment"} marked complete.`,
                          });
                        }}
                      >
                        Confirm
                      </ActionButton>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="confirm-copy">
              <p>
                Are you sure you want to <strong>{bulkConfirmAction.type === "delete" ? "delete" : `mark as ${bulkConfirmAction.type}`}</strong>{" "}
                {selectedRows.length} selected shipment group{selectedRows.length === 1 ? "" : "s"}?
              </p>
            </div>
          )}
          <div className="modal-actions">
            <ActionButton type="button" tone="ghost" onClick={() => setBulkConfirmAction(null)}>
              {bulkConfirmAction.type === "completed" ? "Done" : "Cancel"}
            </ActionButton>
            {bulkConfirmAction.type !== "completed" ? (
              <ActionButton
                type="button"
                tone={bulkConfirmAction.type === "delete" ? "danger" : "primary"}
                onClick={async () => {
                  if (bulkConfirmAction.type === "delete") {
                    await handleBulkDelete();
                  } else {
                    await handleBulkStatusChange("archived");
                  }
                  setBulkConfirmAction(null);
                }}
              >
                Confirm
              </ActionButton>
            ) : null}
          </div>
        </Modal>
      )}

      {clearancePrompt && (
        <Modal
          title="Clearance Document Number"
          onClose={() => {
            setClearancePrompt(null);
            setClearanceDocNumber("");
          }}
        >
          <div className="document-form-grid">
            <label className="document-field">
              <span>Clearance Doc Number</span>
              <input
                value={clearanceDocNumber}
                onChange={(event) => setClearanceDocNumber(event.target.value.toUpperCase())}
                placeholder="Enter clearance document number"
              />
              <small className="muted-text">Completion will be recorded only after this number is saved.</small>
            </label>
          </div>
          <div className="modal-actions">
            <ActionButton
              type="button"
              tone="ghost"
              onClick={() => {
                setClearancePrompt(null);
                setClearanceDocNumber("");
              }}
            >
              Cancel
            </ActionButton>
            <ActionButton
              type="button"
              tone="primary"
              onClick={async () => {
                const trimmedDocNumber = clearanceDocNumber.trim();
                if (!trimmedDocNumber) {
                  setFeedback({
                    tone: "error",
                    text: "Add a clearance document number before marking this BL complete.",
                  });
                  return;
                }

                const nextPrompt = clearancePrompt;
                setClearancePrompt(null);
                setClearanceDocNumber("");

                if (!nextPrompt) {
                  return;
                }

                await handleGroupStatusChange(nextPrompt, "completed", {
                  clearance_doc_number: trimmedDocNumber,
                });
              }}
            >
              Save and Complete
            </ActionButton>
          </div>
        </Modal>
      )}

      {rowContextMenu ? (
        <div
          className="context-menu"
          style={{ top: rowContextMenu.y, left: rowContextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setAuditRow(rowContextMenu.row);
              setRowContextMenu(null);
            }}
          >
            Open Shipment Detail
          </button>
          <button
            type="button"
            onClick={() => {
              setQuickEditRow(rowContextMenu.row);
              setRowContextMenu(null);
            }}
          >
            Edit DO Date & Documents
          </button>
          <button
            type="button"
            onClick={() => {
              setActionRow(rowContextMenu.row);
              setRowContextMenu(null);
            }}
          >
            Manage Shipment
          </button>
        </div>
      ) : null}

      {quickEditRow ? (
        <Modal
          title={`Quick Edit${quickEditRow.bl_number ? ` - ${quickEditRow.bl_number}` : ""}`}
          onClose={() => setQuickEditRow(null)}
        >
          <div className="quick-edit-shell">
            <div className="quick-edit-summary">
              <p className="eyebrow">Shipment</p>
              <h4>{quickEditRow.customer_name || "Shipment group"}</h4>
              <span>{quickEditRow.bl_number ? `BL ${quickEditRow.bl_number}` : "BL not linked"}</span>
            </div>
            <div className="quick-edit-grid">
              <label className="field">
                <span>DO Date</span>
                <input
                  type="date"
                  value={getOperationalDraft(quickEditRow).do_date}
                  onChange={(event) => setOperationalDraftValue(quickEditRow, { do_date: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Document Status</span>
                <select
                  value={getOperationalDraft(quickEditRow).document_status}
                  onChange={(event) =>
                    setOperationalDraftValue(quickEditRow, {
                      document_status: event.target.value,
                      original_docs_received_date:
                        event.target.value === "Original"
                          ? getOperationalDraft(quickEditRow).original_docs_received_date
                          : "",
                    })
                  }
                >
                  {DOCUMENT_STATUS_OPTIONS.map((option) => (
                    <option key={`quick-${option || "empty"}`} value={option}>
                      {option || "Select"}
                    </option>
                  ))}
                </select>
              </label>
              {getOperationalDraft(quickEditRow).document_status === "Original" ? (
                <label className="field">
                  <span>Original Received</span>
                  <input
                    type="date"
                    value={getOperationalDraft(quickEditRow).original_docs_received_date}
                    onChange={(event) =>
                      setOperationalDraftValue(quickEditRow, {
                        original_docs_received_date: event.target.value,
                      })
                    }
                  />
                </label>
              ) : null}
            </div>
            <div className="modal-actions">
              <ActionButton type="button" tone="ghost" onClick={() => setQuickEditRow(null)}>
                Cancel
              </ActionButton>
              <ActionButton
                type="button"
                tone="primary"
                disabled={
                  Boolean(fieldSavingKeys[`${quickEditRow.group_key}:do_date`]) ||
                  Boolean(fieldSavingKeys[`${quickEditRow.group_key}:document_status|original_docs_received_date`]) ||
                  (!hasDoDateDraftChanges(quickEditRow, getOperationalDraft(quickEditRow)) &&
                    !hasDocumentDraftChanges(quickEditRow, getOperationalDraft(quickEditRow)))
                }
                onClick={async () => {
                  await saveQuickEditDraft(quickEditRow);
                }}
              >
                {fieldSavingKeys[`${quickEditRow.group_key}:do_date`] ||
                fieldSavingKeys[`${quickEditRow.group_key}:document_status|original_docs_received_date`]
                  ? "Saving..."
                  : "Save Changes"}
              </ActionButton>
            </div>
          </div>
        </Modal>
      ) : null}

      {documentRow && (
        <Modal
          title={`${documentRow.documents_complete ? "Documents" : "Add Documents"} for ${documentRow.bl_number}`}
          onClose={() => {
            setDocumentRow(null);
            setDocumentFiles({ invoice: null, packing_list: null, bl_copy: null });
          }}
        >
          <div className="document-form-grid">
            {DOCUMENT_FIELDS.map(([key, label]) => (
              <label className="document-field" key={key}>
                <span>{label}</span>
                {documentRow.documents?.[key] ? (
                  <div className="document-actions-inline">
                    <button
                      type="button"
                      className="document-link"
                      onClick={() => handleOpenDocument(documentRow.bl_number, key)}
                    >
                      {documentRow.documents[key].original_name}
                    </button>
                    <button
                      type="button"
                      className="document-mini-link"
                      onClick={() =>
                        handleDownloadDocument(
                          documentRow.bl_number,
                          key,
                          documentRow.documents[key].original_name,
                        )
                      }
                    >
                      Download
                    </button>
                  </div>
                ) : (
                  <small className="muted-text">No file uploaded yet</small>
                )}
                <input
                  type="file"
                  onChange={(event) =>
                    setDocumentFiles((current) => ({
                      ...current,
                      [key]: event.target.files?.[0] || null,
                    }))
                  }
                />
                <small className="muted-text">
                  {documentUploadState[`${documentRow.bl_number}:${key}`]
                    ? "Uploading replacement file..."
                    : documentFiles[key]?.name
                      ? `New file selected: ${documentFiles[key].name}`
                      : documentRow.documents?.[key]
                        ? "Choose a new file only if you want to replace the current one."
                        : "Select a file to upload."}
                </small>
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <ActionButton
              type="button"
              tone="ghost"
              onClick={() => {
                setDocumentRow(null);
                setDocumentFiles({ invoice: null, packing_list: null, bl_copy: null });
              }}
            >
              Cancel
            </ActionButton>
            <ActionButton type="button" tone="primary" onClick={handleDocumentSubmit}>
              {documentRow.documents_complete ? "Save Changes" : "Add Documents"}
            </ActionButton>
          </div>
        </Modal>
      )}

      {recordsView && (
        <Modal
          title={recordsView === "completed" ? "Completion Register" : "Archive Register"}
          onClose={() => {
            setRecordsView(null);
            setRecordsSearch("");
            setRecordsMovementFilter("All");
          }}
        >
          <div className="history-panel">
            <p className="panel-copy">
              {recordsView === "completed"
                ? "Finished shipment cycles kept for follow-through and record clarity."
                : "Shipment cycles removed from the live board but kept in archive history."}
            </p>
            <div className="history-tools">
              <input
                className="search-input"
                placeholder="Search customer, BL, container, or clearance doc"
                value={recordsSearch}
                onChange={(event) => setRecordsSearch(event.target.value)}
              />
              <select value={recordsMovementFilter} onChange={(event) => setRecordsMovementFilter(event.target.value)}>
                {MOVEMENT_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
              <ActionButton
                type="button"
                tone="secondary"
                onClick={() =>
                  exportRowsAsCsv(`${recordsView}-shipments.csv`, visibleHistoryRows, [
                    { label: "Customer", value: (row) => row.customer_name },
                    { label: "BL", value: (row) => row.bl_number },
                    { label: "Containers", value: (row) => (row.container_numbers || []).join(", ") },
                    { label: "Movement", value: (row) => row.movement_category },
                    { label: "Latest Location", value: (row) => row.latest_location },
                    { label: "Movement Since", value: (row) => row.movement_since_date || row.latest_time },
                    { label: "Clearance Doc", value: (row) => row.clearance_doc_number },
                  ])
                }
              >
                Export CSV
              </ActionButton>
            </div>
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>BL</th>
                    <th>Containers</th>
                    <th>Movement</th>
                    <th>Movement Since</th>
                    <th>Clearance Doc</th>
                    {recordsView === "archived" ? <th>Restore</th> : null}
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleHistoryRows.length === 0 ? (
                    <tr>
                      <td colSpan={recordsView === "archived" ? 8 : 7} className="empty-cell">
                        No shipment groups available.
                      </td>
                    </tr>
                  ) : (
                    visibleHistoryRows.map((row) => (
                      <tr key={row.group_key}>
                        <td>{row.customer_name || "-"}</td>
                        <td>{row.bl_number || "-"}</td>
                        <td>{(row.container_numbers || []).join(", ") || "-"}</td>
                        <td>{row.movement_category || "-"}</td>
                        <td>{row.movement_since_date || row.latest_time || "-"}</td>
                        <td>{row.clearance_doc_number || "-"}</td>
                        {recordsView === "archived" ? (
                          <td>
                            <ActionButton
                              type="button"
                              tone="secondary"
                              onClick={async () => {
                                await handleGroupStatusChange(row, "active");
                              }}
                            >
                              Undo Archive
                            </ActionButton>
                          </td>
                        ) : null}
                        <td>
                          <ActionButton type="button" tone="ghost" onClick={() => setAuditRow(row)}>
                            View
                          </ActionButton>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <ActionButton
                type="button"
                tone="ghost"
                onClick={() => {
                  setRecordsView(null);
                  setRecordsSearch("");
                  setRecordsMovementFilter("All");
                }}
              >
                Close
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}

      <ShipmentDetailModal
        auditRow={auditRow}
        setAuditRow={setAuditRow}
        setActionReturnRow={setActionReturnRow}
        setActionRow={setActionRow}
        badgeClass={badgeClass}
        relatedCycleRows={relatedCycleRows}
        auditRelatedCyclesExpanded={auditRelatedCyclesExpanded}
        setAuditRelatedCyclesExpanded={setAuditRelatedCyclesExpanded}
        auditJournalExpanded={auditJournalExpanded}
        setAuditJournalExpanded={setAuditJournalExpanded}
        auditEntries={auditEntries}
        getOperationalDraft={getOperationalDraft}
        setOperationalDraftValue={setOperationalDraftValue}
        fieldSavingKeys={fieldSavingKeys}
        handleOperationalFieldSave={handleOperationalFieldSave}
        saveDoDateDraft={saveDoDateDraft}
        saveDocumentDraft={saveDocumentDraft}
        auditControlsExpanded={auditControlsExpanded}
        setAuditControlsExpanded={setAuditControlsExpanded}
      />

      {shipmentImportReviewOpen && (
        <Modal
          title="Action Required - Review Invalid Rows"
          onClose={() => setShipmentImportReviewOpen(false)}
          size="wide"
          actions={
            <ActionButton type="button" tone="primary" disabled={shipmentImporting} onClick={handleImportReviewRecheck}>
              {shipmentImporting ? "Rechecking..." : "Recheck and Import"}
            </ActionButton>
          }
        >
          <div className="audit-panel">
            <div className="confirm-warning">
              Some shipment rows need correction before they can be added to tracking. The list below shows only the
              rows that still need attention.
            </div>

            <div className="audit-hero">
              <section className="audit-hero-primary import-review-hero">
                <span className="audit-detail-title">Review Summary</span>
                <h4>{shipmentImportReviewSummary?.invalid_count || 0} row(s) need correction</h4>
                <div className="audit-hero-meta">
                  <span className="meta-pill">{shipmentImportReviewSummary?.valid_count || 0} ready to import</span>
                  <span className="meta-pill">{shipmentImportReviewSummary?.skipped_blank_count || 0} blank rows ignored</span>
                  {shipmentImportReviewSummary?.duplicate_count ? (
                    <span className="meta-pill">
                      {shipmentImportReviewSummary.duplicate_count} duplicates will be skipped
                    </span>
                  ) : null}
                </div>
              </section>
            </div>

            <div className="import-review-list">
              {shipmentImportReviewRows.map((row) => (
                <section key={row.source_row_number} className="import-review-card">
                  <div className="import-review-card-head">
                    <div>
                      <p className="audit-detail-title">Worksheet Row {row.source_row_number}</p>
                      <h4>{row.customer_name || "Customer not set"}</h4>
                    </div>
                    <span className="import-review-error">{row.error}</span>
                  </div>

                  <div className="mapping-grid import-review-grid">
                    <label className="mapping-field">
                      <span>Customer Name</span>
                      <input
                        type="text"
                        value={row.customer_name || ""}
                        onChange={(event) =>
                          handleImportReviewFieldChange(row.source_row_number, "customer_name", event.target.value)
                        }
                      />
                    </label>

                    <label className="mapping-field">
                      <span>BL Number</span>
                      <input
                        type="text"
                        value={row.bl_number || ""}
                        onChange={(event) =>
                          handleImportReviewFieldChange(row.source_row_number, "bl_number", event.target.value)
                        }
                      />
                    </label>

                    <label className="mapping-field">
                      <span>Container Number</span>
                      <input
                        type="text"
                        value={row.container_number || ""}
                        onChange={(event) =>
                          handleImportReviewFieldChange(row.source_row_number, "container_number", event.target.value)
                        }
                      />
                    </label>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {showGoogleSheetsImportModal && (
        <Modal
          title="Import from Google Sheets"
          onClose={resetShipmentImportState}
          size="wide"
          actions={
            <ActionButton type="button" tone="primary" disabled={shipmentImporting} onClick={handleShipmentImportConfirm}>
              {shipmentImporting ? "Adding..." : "Add shipments"}
            </ActionButton>
          }
        >
          <div className="audit-panel">
            <div className="audit-hero">
              <section className="audit-hero-primary import-review-hero">
                <span className="audit-detail-title">Google Sheet</span>
                <h4>{shipmentImportPreview.sheet_title || "Google Sheet"}</h4>
                <div className="audit-hero-meta">
                  <span className="meta-pill">{shipmentImportPreview.sheet_name || "Selected tab"}</span>
                  <span className="meta-pill">{shipmentImportPreview.preview_rows?.length || 0} rows shown</span>
                </div>
              </section>
            </div>

            <div className="import-preview import-preview-modal">
              <div className="preview-header">
                <div>
                  <h3>Match the fields</h3>
                  <p>Choose the customer, container, and BL columns, then continue.</p>
                </div>
                <div className="file-chip-row">
                  <span className="file-chip">{shipmentImportPreview.available_sheets?.length || 0} tabs</span>
                  {shipmentImportPreview.remembered_mapping?.container_number ? (
                    <span className="file-chip">Using last layout</span>
                  ) : null}
                </div>
              </div>

              <div className="mapping-grid">
                {MAPPING_FIELDS.map(([field, label]) => (
                  <label className="mapping-field" key={field}>
                    <span>{label}</span>
                    <select
                      value={shipmentImportMapping[field]}
                      onChange={(event) =>
                        setShipmentImportMapping((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select column</option>
                      {(shipmentImportPreview.available_columns || []).map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {shipmentImportReviewSummary?.invalid_count ? (
                <div className="confirm-warning">
                  <strong>Action Required:</strong> {shipmentImportReviewSummary.invalid_count} shipment row(s) need
                  correction before import.
                  <div className="edit-actions-row">
                    <ActionButton type="button" tone="secondary" onClick={() => setShipmentImportReviewOpen(true)}>
                      Review Invalid Rows
                    </ActionButton>
                  </div>
                </div>
              ) : null}

              {shipmentImportReviewSummary?.duplicate_count ? (
                <div className="confirm-note">
                  <strong>Duplicate check:</strong> {shipmentImportReviewSummary.duplicate_count} shipment row(s)
                  already exist in this source or in the portal and will be skipped automatically.
                </div>
              ) : null}
            </div>
          </div>
        </Modal>
      )}

      {sourceBatchDetail && (
        <Modal title={`Import Batch #${sourceBatchDetail.id}`} onClose={() => setSourceBatchDetail(null)} size="wide">
          <div className="history-panel">
            <div className="audit-detail-grid">
              <section className="audit-detail-card">
                <p className="audit-detail-title">Source</p>
                <div className="audit-kv-grid">
                  <div>
                    <span>Label</span>
                    <strong>{sourceBatchDetail.source?.source_label || "-"}</strong>
                  </div>
                  <div>
                    <span>Reference</span>
                    <strong>{sourceBatchDetail.source?.source_reference || "-"}</strong>
                  </div>
                  <div>
                    <span>Sheet</span>
                    <strong>{sourceBatchDetail.source_sheet || "-"}</strong>
                  </div>
                  <div>
                    <span>Header Row</span>
                    <strong>{sourceBatchDetail.header_row || "-"}</strong>
                  </div>
                </div>
              </section>

              <section className="audit-detail-card">
                <p className="audit-detail-title">Batch Summary</p>
                <div className="audit-kv-grid">
                  <div>
                    <span>Imported</span>
                    <strong>{sourceBatchDetail.imported_count || 0}</strong>
                  </div>
                  <div>
                    <span>Duplicates</span>
                    <strong>{sourceBatchDetail.duplicate_count || 0}</strong>
                  </div>
                  <div>
                    <span>Invalid</span>
                    <strong>{sourceBatchDetail.invalid_count || 0}</strong>
                  </div>
                  <div>
                    <span>Blank</span>
                    <strong>{sourceBatchDetail.skipped_blank_count || 0}</strong>
                  </div>
                </div>
              </section>
            </div>

            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Status</th>
                    <th>Customer</th>
                    <th>BL</th>
                    <th>Container</th>
                    <th>Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {(sourceBatchDetail.rows || []).length === 0 ? (
                    <tr>
                      <td colSpan="6" className="empty-cell">No preserved source rows available.</td>
                    </tr>
                  ) : (
                    sourceBatchDetail.rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.source_row_number || "-"}</td>
                        <td>{row.row_status || "-"}</td>
                        <td>{row.mapped_row?.customer_name || "-"}</td>
                        <td>{row.mapped_row?.bl_number || "-"}</td>
                        <td>{row.mapped_row?.container_number || "-"}</td>
                        <td>{row.row_error || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      {ownerUserShipments && (
        <Modal title={ownerUserShipments.user?.email || "User shipments"} onClose={() => setOwnerUserShipments(null)} size="wide">
          <div className="history-panel">
            <div className="owner-user-shipments-summary">
              <div className="meta-pill-row">
                <span className="meta-pill">{ownerUserShipments.metrics?.shipment_groups || 0} shipment groups</span>
                <span className="meta-pill">{ownerUserShipments.metrics?.shipment_rows || 0} shipment rows</span>
                <span className="meta-pill">{ownerUserShipments.metrics?.live_shipments || 0} live</span>
                <span className="meta-pill">{ownerUserShipments.metrics?.completed_shipments || 0} completed</span>
                <span className="meta-pill">{ownerUserShipments.metrics?.archived_shipments || 0} archived</span>
              </div>
            </div>

            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>BL</th>
                    <th>Containers</th>
                    <th>Movement</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Since</th>
                  </tr>
                </thead>
                <tbody>
                  {(ownerUserShipments.shipments || []).length === 0 ? (
                    <tr>
                      <td colSpan="7" className="empty-cell">No shipments in this workspace yet.</td>
                    </tr>
                  ) : (
                    (ownerUserShipments.shipments || []).map((row) => (
                      <tr key={row.group_key}>
                        <td>{row.customer_name || "-"}</td>
                        <td>{row.bl_number || "-"}</td>
                        <td>{(row.container_numbers || []).join(", ") || "-"}</td>
                        <td>
                          <span className={badgeClass("movement", row.movement_category || "Unknown")}>
                            {row.movement_category || "-"}
                          </span>
                        </td>
                        <td>
                          <span className={badgeClass("status", row.shipment_status || "Unknown")}>
                            {formatShipmentStatusLabel(row.shipment_status)}
                          </span>
                        </td>
                        <td>{formatLocationLabel(row.latest_location) || "-"}</td>
                        <td>{row.movement_since_date || row.latest_time || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      {ownerDeleteUser && (
        <Modal
          title="Remove user"
          onClose={() => setOwnerDeleteUser(null)}
          actions={
            <ActionButton type="button" tone="danger" disabled={ownerDeletingUser} onClick={handleDeleteOwnerUser}>
              {ownerDeletingUser ? "Removing..." : "Remove user"}
            </ActionButton>
          }
        >
          <div className="confirm-copy">
            <p>
              This will remove <strong>{ownerDeleteUser.email}</strong> and clear that user&apos;s shipment workspace,
              imports, history, and saved source data.
            </p>
            <p>This action is permanent and should be used only when you truly want to close that workspace.</p>
          </div>
        </Modal>
      )}

      {editRow && (
        <Modal title="Edit Shipment Details" onClose={closeEditModal}>
          <form className="stack-form" onSubmit={handleEditShipment}>
            <label className="field-label" htmlFor="edit_customer_name">
              Customer Name
            </label>
            <input
              id="edit_customer_name"
              list="customer-suggestions"
              value={editForm.customer_name}
              onChange={(event) => handleEditFieldChange("customer_name", event.target.value)}
              placeholder="Revachi International PVT. LTD."
            />

            <label className="field-label" htmlFor="edit_container_input">
              Container Numbers
            </label>
            <textarea
              id="edit_container_input"
              rows="5"
              value={editForm.container_input}
              onChange={(event) => handleEditFieldChange("container_input", event.target.value)}
              placeholder={"TCNU1491563\nMRKU6677543\nTTNU1079348"}
            />
            <p className="field-help">
              Keep one container per line. Every value must use 4 letters followed by 7 digits.
            </p>

            <label className="field-label" htmlFor="edit_bl_number">
              BL Number
            </label>
            <input
              id="edit_bl_number"
              value={editForm.bl_number}
              onChange={(event) => handleEditFieldChange("bl_number", event.target.value)}
              placeholder="265636541"
            />

            <label className="field-label" htmlFor="edit_clearance_doc_number">
              Clearance Doc Number
            </label>
            <input
              id="edit_clearance_doc_number"
              value={editForm.clearance_doc_number}
              onChange={(event) => handleEditFieldChange("clearance_doc_number", event.target.value.toUpperCase())}
              placeholder="M-7401"
            />

            <div className="audit-form-grid">
              <label className="audit-field" htmlFor="edit_do_date">
                <span>DO Date</span>
                <input
                  id="edit_do_date"
                  className="inline-field-control"
                  type="date"
                  value={editForm.do_date}
                  onChange={(event) => handleEditFieldChange("do_date", event.target.value)}
                />
              </label>
              <label className="audit-field" htmlFor="edit_document_status">
                <span>Document Status</span>
                <select
                  id="edit_document_status"
                  className="inline-field-control"
                  value={editForm.document_status}
                  onChange={(event) => {
                    handleEditFieldChange("document_status", event.target.value);
                    if (event.target.value !== "Original") {
                      handleEditFieldChange("original_docs_received_date", "");
                    }
                  }}
                >
                  {DOCUMENT_STATUS_OPTIONS.map((option) => (
                    <option key={option || "empty"} value={option}>
                      {option || "Select"}
                    </option>
                  ))}
                </select>
              </label>
              {editForm.document_status === "Original" ? (
                <label className="audit-field" htmlFor="edit_original_docs_received_date">
                  <span>Original Received</span>
                  <input
                    id="edit_original_docs_received_date"
                    className="inline-field-control"
                    type="date"
                    value={editForm.original_docs_received_date}
                    onChange={(event) => handleEditFieldChange("original_docs_received_date", event.target.value)}
                  />
                </label>
              ) : null}
            </div>

            <div className="button-row compact-row edit-actions-row">
              <ActionButton type="button" tone="ghost" onClick={closeEditModal}>
                Cancel
              </ActionButton>
              <ActionButton type="submit" tone="primary" disabled={editSubmitting}>
                {editSubmitting ? "Saving..." : "Save Details"}
              </ActionButton>
            </div>
          </form>
        </Modal>
      )}

      {passwordModalOpen && (
        <Modal
          title={currentUser?.password_reset_required ? "Choose a new private password" : "Change Password"}
          onClose={() => {
            if (!currentUser?.password_reset_required) {
              setPasswordModalOpen(false);
              setPasswordForm(INITIAL_PASSWORD_FORM);
            }
          }}
        >
          <form className="stack-form" onSubmit={handleChangePassword}>
            <p className="panel-copy">
              {currentUser?.password_reset_required
                ? "An administrator reset your access. Please choose a new password so only you know it."
                : "Update your password when you need a fresh, private sign-in."}
            </p>
            <label className="field-label" htmlFor="current_password">
              Current Password
            </label>
            <input
              id="current_password"
              type="password"
              value={passwordForm.current_password}
              onChange={(event) => handlePasswordFieldChange("current_password", event.target.value)}
              placeholder="Enter your current password"
              required
            />
            <label className="field-label" htmlFor="new_password">
              New Password
            </label>
            <input
              id="new_password"
              type="password"
              value={passwordForm.new_password}
              onChange={(event) => handlePasswordFieldChange("new_password", event.target.value)}
              placeholder="Choose a new password"
              required
            />
            <label className="field-label" htmlFor="confirm_new_password">
              Confirm New Password
            </label>
            <input
              id="confirm_new_password"
              type="password"
              value={passwordForm.confirm_password}
              onChange={(event) => handlePasswordFieldChange("confirm_password", event.target.value)}
              placeholder="Confirm the new password"
              required
            />
            <div className="button-row compact-row edit-actions-row">
              {!currentUser?.password_reset_required ? (
                <ActionButton
                  type="button"
                  tone="ghost"
                  onClick={() => {
                    setPasswordModalOpen(false);
                    setPasswordForm(INITIAL_PASSWORD_FORM);
                  }}
                >
                  Cancel
                </ActionButton>
              ) : null}
              <ActionButton type="submit" tone="primary" disabled={passwordSubmitting}>
                {passwordSubmitting ? "Saving..." : "Save Password"}
              </ActionButton>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
