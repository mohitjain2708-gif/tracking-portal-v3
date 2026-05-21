import ActionButton from "../../components/common/ActionButton";
import SectionHeader from "../../components/common/SectionHeader";
import IntakeLauncherCard from "../../components/dashboard/IntakeLauncherCard";
import {
  MAPPING_FIELDS,
} from "../../constants/portalConstants";

export default function IntakeWorkspace({
  activeIntakePanel,
  setActiveIntakePanel,
  customerSuggestions,
  manualForm,
  handleFieldChange,
  handleAddShipment,
  shipmentImportFile,
  setShipmentImportFile,
  handleShipmentImportPreview,
  sourceBatches,
  sourceMappings,
  openSourceBatchDetail,
  shipmentImportPreview,
  shipmentImportSourceContext,
  shipmentImportMapping,
  setShipmentImportMapping,
  shipmentImporting,
  handleShipmentImportConfirm,
  shipmentImportReviewSummary,
  setShipmentImportReviewOpen,
  googleSheetState,
  googleSheetLoading,
  handleGoogleSheetUrlChange,
  handleGoogleSheetFetch,
  setGoogleSheetState,
  handleGoogleSheetSelectPreview,
  sourceConnections,
}) {
  return (
    <section className="surface intake-shell">
      <SectionHeader
        eyebrow="Intake"
        title="Add or import shipments"
        description="Bring shipments in the way that suits you."
      />

      <div className="intake-launcher-grid">
        <IntakeLauncherCard
          eyebrow="Manual"
          title="Add shipment"
          description="Enter a shipment by hand."
          isActive={activeIntakePanel === "manual"}
          onClick={() => setActiveIntakePanel((current) => (current === "manual" ? null : "manual"))}
          motionIndex={0}
        />
        <IntakeLauncherCard
          eyebrow="Workbook"
          title="Import from Excel"
          description="Bring in an Excel sheet."
          isActive={activeIntakePanel === "excel"}
          onClick={() => setActiveIntakePanel((current) => (current === "excel" ? null : "excel"))}
          motionIndex={1}
        />
        <IntakeLauncherCard
          eyebrow="Google"
          title="Import from Google Sheets"
          description="Bring in a Google Sheet."
          isActive={activeIntakePanel === "google"}
          onClick={() => setActiveIntakePanel((current) => (current === "google" ? null : "google"))}
          motionIndex={2}
        />
      </div>

      {activeIntakePanel === "manual" ? (
        <article className="intake-expanded-panel">
          <SectionHeader
            eyebrow="Manual"
            title="Add shipment"
            description="Enter the customer, BL, and containers."
          />

          <form className="stack-form" onSubmit={handleAddShipment}>
            <label className="field-label" htmlFor="customer_name">
              Customer Name
            </label>
            <input
              id="customer_name"
              list="customer-suggestions"
              value={manualForm.customer_name}
              onChange={(event) => handleFieldChange("customer_name", event.target.value)}
              placeholder="Revachi International Limited"
            />
            <datalist id="customer-suggestions">
              {customerSuggestions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>

            <label className="field-label" htmlFor="container_input">
              Container Numbers
            </label>
            <textarea
              id="container_input"
              rows="4"
              value={manualForm.container_input}
              onChange={(event) => handleFieldChange("container_input", event.target.value)}
              placeholder={"TCNU1491563\nMRKU6677543\nTTNU1079348"}
            />
            <p className="field-help">One container per line.</p>

            <label className="field-label" htmlFor="bl_number">
              BL Number
            </label>
            <input
              id="bl_number"
              value={manualForm.bl_number}
              onChange={(event) => handleFieldChange("bl_number", event.target.value)}
              placeholder="265636541"
            />

            <ActionButton type="submit" tone="primary">
              Add Shipment
            </ActionButton>
          </form>
        </article>
      ) : null}

      {activeIntakePanel === "excel" ? (
        <article className="intake-expanded-panel">
          <SectionHeader
            eyebrow="Workbook"
            title="Import from Excel"
            description="Upload the sheet, then match the fields."
          />

          <div className="stack-form">
            <label className="field-label" htmlFor="shipment_import_file">
              Excel file
            </label>
            <input
              id="shipment_import_file"
              type="file"
              accept=".xlsx,.xlsm"
              onChange={(event) => setShipmentImportFile(event.target.files?.[0] || null)}
            />

            <div className="button-row compact-row">
              <ActionButton type="button" tone="secondary" onClick={handleShipmentImportPreview}>
                Continue
              </ActionButton>
              {shipmentImportFile && <span className="file-chip">{shipmentImportFile.name}</span>}
            </div>
            <p className="field-help">`.xlsx` and `.xlsm`, up to 10 MB.</p>
            {(sourceBatches.length || sourceMappings.length) ? (
              <div className="quiet-source-note">
                {sourceBatches[0] ? (
                  <button type="button" className="quiet-link" onClick={() => openSourceBatchDetail(sourceBatches[0].id)}>
                    View last import
                  </button>
                ) : null}
                {sourceMappings.length ? <span>Column choices are remembered quietly.</span> : null}
              </div>
            ) : null}
          </div>

          {shipmentImportPreview && shipmentImportSourceContext?.source_type !== "google_sheets" ? (
            <div className="import-preview">
              <div className="preview-header">
                <div>
                  <h3>Match the columns</h3>
                  <p>Check the fields once, then continue.</p>
                </div>
                <div className="file-chip-row">
                  <span className="file-chip">{shipmentImportPreview.preview_rows?.length || 0} rows shown</span>
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

              <ActionButton type="button" tone="primary" disabled={shipmentImporting} onClick={handleShipmentImportConfirm}>
                {shipmentImporting ? "Adding..." : "Add shipments"}
              </ActionButton>

              {shipmentImportReviewSummary?.invalid_count ? (
                <div className="confirm-warning">
                  <strong>Action Required:</strong> {shipmentImportReviewSummary.invalid_count} shipment row(s) need correction before import.
                  <div className="edit-actions-row">
                    <ActionButton type="button" tone="secondary" onClick={() => setShipmentImportReviewOpen(true)}>
                      Review Invalid Rows
                    </ActionButton>
                  </div>
                </div>
              ) : null}

              {shipmentImportReviewSummary?.duplicate_count ? (
                <div className="confirm-note">
                  <strong>Duplicate check:</strong> {shipmentImportReviewSummary.duplicate_count} shipment row(s) already exist in this source or in the portal and will be skipped automatically.
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
      ) : null}

      {activeIntakePanel === "google" ? (
        <article className="intake-expanded-panel">
          <SectionHeader
            eyebrow="Google"
            title="Import from Google Sheets"
            description="Paste the sheet link, choose the tab, then match the fields."
          />

          <div className="stack-form">
            <label className="field-label" htmlFor="google_sheet_url">
              Google Sheet link
            </label>
            <input
              id="google_sheet_url"
              value={googleSheetState.source_url}
              onChange={(event) => handleGoogleSheetUrlChange(event.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />

            <div className="button-row compact-row">
              <ActionButton type="button" tone="secondary" disabled={googleSheetLoading} onClick={handleGoogleSheetFetch}>
                {googleSheetLoading ? "Checking..." : "Continue"}
              </ActionButton>
              {googleSheetState.sheet_title ? <span className="file-chip">{googleSheetState.sheet_title}</span> : null}
            </div>
            <p className="field-help">Shared-link access for now. Private sync will use Google sign-in.</p>

            {googleSheetState.available_sheets?.length ? (
              <>
                <label className="field-label" htmlFor="google_sheet_tab">
                  Sheet tab
                </label>
                <select
                  id="google_sheet_tab"
                  value={googleSheetState.selected_sheet}
                  onChange={(event) =>
                    setGoogleSheetState((current) => ({
                      ...current,
                      selected_sheet: event.target.value,
                    }))
                  }
                >
                  <option value="">Select a tab</option>
                  {googleSheetState.available_sheets.map((sheetName) => (
                    <option key={sheetName} value={sheetName}>
                      {sheetName}
                    </option>
                  ))}
                </select>

                <div className="button-row compact-row">
                  <ActionButton
                    type="button"
                    tone="primary"
                    disabled={googleSheetLoading || !googleSheetState.selected_sheet}
                    onClick={handleGoogleSheetSelectPreview}
                  >
                    {googleSheetLoading ? "Loading..." : "Continue"}
                  </ActionButton>
                </div>
              </>
            ) : null}

            {sourceConnections.filter((connection) => connection.provider === "google_sheets").length ? (
              <div className="quiet-source-note">
                <span>Recent sheet</span>
                <div className="source-batch-list">
                  {sourceConnections
                    .filter((connection) => connection.provider === "google_sheets")
                    .slice(0, 1)
                    .map((connection) => (
                      <span key={connection.id} className="source-batch-chip source-batch-chip-static">
                        <span>{connection.connection_label || "Google Sheet"}</span>
                        <strong>{connection.worksheet_name || "Tab"}</strong>
                      </span>
                    ))}
                </div>
              </div>
            ) : null}
          </div>
        </article>
      ) : null}
    </section>
  );
}

