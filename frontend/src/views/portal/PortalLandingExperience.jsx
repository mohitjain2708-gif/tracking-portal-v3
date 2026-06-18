import React from "react";

import ActionButton from "../../components/common/ActionButton";
import ContainerChipList from "../../components/common/ContainerChipList";
import DashboardMetric from "../../components/dashboard/DashboardMetric";
import MovementIcon from "../../components/dashboard/MovementIcon";
import MovementIdentifier from "../../components/dashboard/MovementIdentifier";
import SortableHeader from "../../components/dashboard/SortableHeader";
import StatCard from "../../components/dashboard/StatCard";
import {
  badgeClass,
  formatBlSurrenderStatusLabel,
  formatActionSummary,
  formatDocumentStatusSummary,
  formatLocationLabel,
  formatPaymentStatusLabel,
  formatShipmentStatusLabel,
  normalizeBlSurrenderStatus,
  normalizePaymentStatus,
} from "../../lib/portalUtils";
import { UIPreferenceSegmentedControl, useUIPreference } from "../../ui/UIPreferenceContext";

const SORT_LABELS = {
  customer_name: "Customer",
  container_number: "Containers",
  bl_number: "BL",
  shipment_status: "Status",
  movement_category: "Movement",
  latest_location: "Latest location",
  movement_since_date: "Movement since",
  train_no: "Train number",
  departure: "Departure",
};

function renderMetricIcon(metric, MovementIcon) {
  if (metric.iconKind === "movement") {
    return <MovementIcon type={metric.iconType} />;
  }

  if (metric.iconKind === "approaching") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v10" />
        <path d="M8 8h8" />
        <path d="M6 18c1-.8 2-.8 3 0s2 .8 3 0 2-.8 3 0 2 .8 3 0" />
        <circle cx="12" cy="4" r="1.7" />
      </svg>
    );
  }

  if (metric.iconKind === "rail-week") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4h10c1.7 0 3 1.3 3 3v7c0 1.7-1.3 3-3 3H7c-1.7 0-3-1.3-3-3V7c0-1.7 1.3-3 3-3Z" />
        <path d="M7 17l-2 3M17 17l2 3M8 20h8M7 8h10M7 12h10" />
        <circle cx="8" cy="15" r="1" />
        <circle cx="16" cy="15" r="1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

function WorkspaceCluster({ onWorkspaceChange }) {
  return (
    <div className="hero-toolbar-cluster">
      <label className="workspace-switcher" aria-label="Switch workspace">
        <select value="tracking" onChange={onWorkspaceChange}>
          <option value="tracking">Tracking Portal</option>
          <option value="tax-table">Tax Table Utility</option>
        </select>
      </label>
      <UIPreferenceSegmentedControl />
    </div>
  );
}

function SessionCluster({ demoSessionEnabled, currentUser, onOpenPassword, onLogout }) {
  if (demoSessionEnabled || !currentUser) {
    return null;
  }

  return (
    <div className="session-chip">
      <span>{currentUser.email}</span>
      <button type="button" onClick={onOpenPassword}>
        Change password
      </button>
      <button type="button" onClick={onLogout}>
        Sign Out
      </button>
    </div>
  );
}

function PremiumSummaryCard({ label, value, helperText, tone = "default", onClick }) {
  const Element = onClick ? "button" : "article";

  return (
    <Element
      type={onClick ? "button" : undefined}
      className={`premium-summary-card premium-summary-card-${tone}${onClick ? " is-clickable" : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {helperText ? <p>{helperText}</p> : null}
    </Element>
  );
}

function PremiumMetricCard({ metric, MovementIcon }) {
  const topCustomer = Array.isArray(metric.customers) && metric.customers.length > 0 ? metric.customers[0] : null;

  return (
    <article className={`premium-metric-card premium-metric-card-${metric.tone}`}>
      <div className="premium-metric-card-head">
        <span className="premium-metric-icon">{renderMetricIcon(metric, MovementIcon)}</span>
        <div>
          <p>{metric.label}</p>
          <strong>{metric.value}</strong>
        </div>
      </div>
      <span className="premium-metric-note">
        {topCustomer
          ? `${topCustomer.customer_name} leads this view right now.`
          : metric.helperText}
      </span>
    </article>
  );
}

function RowActionSummary({ row, className = "" }) {
  const summary = formatActionSummary(row);
  if (!summary) {
    return null;
  }
  return <div className={`row-action-summary ${className}`.trim()}>{summary}</div>;
}

function buildContextMenuAnchor(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    clientX: rect.right - Math.min(18, rect.width / 2),
    clientY: rect.bottom + 10,
  };
}

function BlSurrenderLine({ status, className = "" }) {
  const normalizedStatus = normalizeBlSurrenderStatus(status);
  const label = formatBlSurrenderStatusLabel(normalizedStatus);
  if (!label) {
    return null;
  }
  return (
    <div
      className={`bl-surrender-line${normalizedStatus ? ` bl-surrender-line-${normalizedStatus}` : ""} ${className}`.trim()}
    >
      {label}
    </div>
  );
}

function PaymentStatusLine({ status, className = "" }) {
  const normalizedStatus = normalizePaymentStatus(status);
  const label = formatPaymentStatusLabel(normalizedStatus);
  if (!label) {
    return null;
  }
  return (
    <div
      className={`payment-status-line${normalizedStatus ? ` payment-status-line-${normalizedStatus}` : ""} ${className}`.trim()}
    >
      {label}
    </div>
  );
}

function OperationalStatusLine({ blStatus, paymentStatus, className = "" }) {
  const hasBlStatus = Boolean(formatBlSurrenderStatusLabel(blStatus));
  const hasPaymentStatus = Boolean(formatPaymentStatusLabel(paymentStatus));

  if (!hasBlStatus && !hasPaymentStatus) {
    return null;
  }

  return (
    <div className={`operational-status-line ${className}`.trim()}>
      {hasBlStatus ? <BlSurrenderLine status={blStatus} /> : null}
      {hasPaymentStatus ? <PaymentStatusLine status={paymentStatus} /> : null}
    </div>
  );
}

function ClassicMobileShipmentCard({
  row,
  isSelected,
  isExpanded,
  onToggleSelection,
  onOpenAuditRow,
  onOpenDocuments,
  onOpenRowContextMenu,
}) {
  return (
    <article
      className={`mobile-shipment-card ${isSelected ? "is-selected" : ""} ${row.destuffing_ready ? "is-destuffing-ready" : ""}`}
      onClick={() => onOpenAuditRow(row)}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenRowContextMenu(row, event);
      }}
    >
      <div className="mobile-shipment-card-head">
        <label className="mobile-select-toggle" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(row)}
            aria-label={`Select shipment ${row.bl_number || row.primary_container_number}`}
          />
          <span>Select</span>
        </label>
        <div className="mobile-shipment-meta">
          <span className={badgeClass("status", row.shipment_status)}>{formatShipmentStatusLabel(row.shipment_status)}</span>
          <span className={badgeClass("movement", row.movement_category)}>{row.movement_category || "Hi Seas"}</span>
        </div>
      </div>

      <div className="mobile-shipment-identity">
        <h3>{row.customer_name || "Unnamed customer"}</h3>
        <OperationalStatusLine
          blStatus={row.bl_surrender_status}
          paymentStatus={row.payment_status}
          className="mobile-status-line"
        />
        <p>{row.bl_number ? `BL ${row.bl_number}` : "BL not linked yet"}</p>
        <RowActionSummary row={row} className="mobile-row-action-summary" />
      </div>

      <div className="mobile-shipment-containers">
        <ContainerChipList row={row} expanded={isExpanded} showOverflowHint={false} labelVariant="short" />
      </div>

      <div className="mobile-shipment-facts">
        <div className="mobile-fact">
          <span>Latest location</span>
          <strong>{formatLocationLabel(row.latest_location) || "Not available"}</strong>
        </div>
        <div className="mobile-fact">
          <span>Movement since</span>
          <strong>{row.movement_since_date || row.latest_time || "-"}</strong>
        </div>
        <div className="mobile-fact">
          <span>DO date</span>
          <strong>{row.do_date || "Not set"}</strong>
        </div>
        <div className="mobile-fact">
          <span>Documents</span>
          <strong>{formatDocumentStatusSummary(row)}</strong>
        </div>
      </div>

      <div className="mobile-shipment-actions" onClick={(event) => event.stopPropagation()}>
        <ActionButton type="button" tone="secondary" onClick={() => onOpenAuditRow(row)}>
          Open details
        </ActionButton>
        <ActionButton type="button" tone="ghost" onClick={() => onOpenDocuments(row)}>
          {row.documents_complete ? "Open Documents" : "Add Documents"}
        </ActionButton>
        <ActionButton
          type="button"
          tone="ghost"
          compact
          onClick={(event) => onOpenRowContextMenu(row, buildContextMenuAnchor(event))}
        >
          Actions
        </ActionButton>
      </div>
    </article>
  );
}

function PremiumShipmentCard({
  row,
  isSelected,
  isExpanded,
  onToggleSelection,
  onOpenAuditRow,
  onOpenRowContextMenu,
  onOpenDocuments,
  badgeClass,
  formatLocationLabel,
  formatDocumentStatusSummary,
  formatShipmentStatusLabel,
}) {
  return (
    <article
      className={`premium-shipment-card ${isSelected ? "is-selected" : ""} ${row.destuffing_ready ? "is-destuffing-ready" : ""}`}
      onClick={() => onOpenAuditRow(row)}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenRowContextMenu(row, event);
      }}
    >
      <div className="premium-shipment-card-head">
        <label className="premium-card-select" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(row)}
            aria-label={`Select shipment ${row.bl_number || row.primary_container_number}`}
          />
          <span>Select</span>
        </label>
        <div className="premium-card-statuses">
          <span className={badgeClass("status", row.shipment_status)}>{formatShipmentStatusLabel(row.shipment_status)}</span>
          <span className={badgeClass("movement", row.movement_category)}>{row.movement_category || "Hi Seas"}</span>
        </div>
      </div>

      <div className="premium-shipment-identity">
        <div>
          <h3>{row.customer_name || "Unnamed customer"}</h3>
          <div className="premium-identity-meta">
            <OperationalStatusLine
              blStatus={row.bl_surrender_status}
              paymentStatus={row.payment_status}
              className="premium-status-line"
            />
            <p>{row.bl_number ? `BL ${row.bl_number}` : "BL not linked yet"}</p>
          </div>
          <RowActionSummary row={row} className="premium-row-action-summary" />
        </div>
        <div className="premium-card-containers">
          <ContainerChipList row={row} expanded={isExpanded} showOverflowHint={false} labelVariant="short" />
        </div>
      </div>

      <div className="premium-shipment-facts">
        <div>
          <span>Latest location</span>
          <strong>{formatLocationLabel(row.latest_location) || "Not available"}</strong>
        </div>
        <div>
          <span>Movement since</span>
          <strong>{row.movement_since_date || row.latest_time || "-"}</strong>
        </div>
        <div>
          <span>Train no</span>
          <strong>{row.train_no || "-"}</strong>
        </div>
        <div>
          <span>Departure</span>
          <strong>{row.departure || "-"}</strong>
        </div>
        <div>
          <span>DO date</span>
          <strong>{row.do_date || "Not set"}</strong>
        </div>
        <div>
          <span>Documents</span>
          <strong>{formatDocumentStatusSummary(row)}</strong>
        </div>
      </div>

      <div className="premium-shipment-card-actions">
        <span className={`docs-status ${row.documents_complete ? "is-complete" : ""}`}>
          {row.documents_complete ? "Documents complete" : "Documents pending"}
        </span>
        <div className="compact-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={(event) => {
              event.stopPropagation();
              onOpenAuditRow(row);
            }}
          >
            Open details
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDocuments(row);
            }}
          >
            {row.documents_complete ? "Open Documents" : "Add Documents"}
          </button>
          <button
            type="button"
            className="button button-ghost premium-card-actions-more"
            onClick={(event) => {
              event.stopPropagation();
              onOpenRowContextMenu(row, buildContextMenuAnchor(event));
            }}
          >
            Actions
          </button>
        </div>
      </div>
    </article>
  );
}

function ClassicPortalLandingView({ model, ownerPanel }) {
  const { hero, session, stats, metrics, filters, bulk, table, actions } = model;

  return (
    <>
      <section className="surface hero-panel dual-ui-shell">
        <div className="hero-toolbar">
          <WorkspaceCluster onWorkspaceChange={actions.onWorkspaceChange} />
          <SessionCluster
            demoSessionEnabled={session.demoSessionEnabled}
            currentUser={session.currentUser}
            onOpenPassword={actions.onOpenPassword}
            onLogout={actions.onLogout}
          />
        </div>

        <div className="hero-main">
          <div className="hero-copy-wrap">
            <h1>{hero.title}</h1>
            <div className="hero-actions compact-actions">
              <ActionButton type="button" tone="secondary" onClick={actions.onRefreshDashboard}>
                {hero.refreshing ? "Refreshing..." : "Refresh Dashboard"}
              </ActionButton>
              <ActionButton type="button" tone="primary" onClick={actions.onRefreshTracking}>
                Refresh Live Shipments
              </ActionButton>
              <label className="toggle-card hero-toggle">
                <span className="toggle-copy">
                  <strong>Auto Refresh</strong>
                  <span>Every 5 minutes</span>
                </span>
                <input
                  type="checkbox"
                  checked={hero.autoRefresh}
                  onChange={(event) => actions.onToggleAutoRefresh(event.target.checked)}
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      {ownerPanel}

      <section className="stats-grid">
        {stats.map((item, index) => (
          <StatCard
            key={item.key}
            label={item.label}
            value={item.value}
            helperText={item.helperText}
            onClick={item.onClick}
            motionIndex={index}
          />
        ))}
      </section>

      <section className="surface metrics-panel">
        <div className="panel-heading compact-heading">
          <div>
            <p className="eyebrow">Overview</p>
            <h2>Current Shipments</h2>
          </div>
        </div>
        <div className="dashboard-header-metrics">
          {metrics.map((metric, index) => (
            <DashboardMetric
              key={metric.key}
              label={metric.label}
              value={metric.value}
              tone={metric.tone}
              motionIndex={index}
              icon={renderMetricIcon(metric, MovementIcon)}
              customers={metric.customers}
            />
          ))}
        </div>
      </section>

      <section className="surface dashboard-panel">
        <div className="dashboard-header compact-dashboard-header">
          <div>
            <p className="eyebrow">Live Dashboard</p>
            <h2>Shipment Board</h2>
          </div>
          <div className="compact-actions">
            <ActionButton type="button" tone="secondary" onClick={actions.onExportDashboard}>
              Download Report
            </ActionButton>
          </div>
        </div>

        <div className="filter-bar">
          <div className="movement-identifiers">
            {filters.movementOptions.map((filter, index) => (
              <MovementIdentifier
                key={filter.value}
                filter={{ value: filter.value, label: filter.label }}
                isActive={filters.activeMovement === filter.value}
                count={filter.count}
                onClick={() => actions.onMovementFilterChange(filter.value)}
                motionIndex={index}
              />
            ))}
          </div>

          <div className="tool-row">
            <select
              value={filters.activeShipmentStatus}
              onChange={(event) => actions.onShipmentStatusFilterChange(event.target.value)}
            >
              {filters.shipmentStatusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>

            <input
              className="search-input"
              placeholder="Search customer, BL, container, place or train"
              value={filters.search}
              onChange={(event) => actions.onSearchChange(event.target.value)}
            />
          </div>
        </div>

        {bulk.count ? (
          <section className="bulk-toolbar">
            <div className="bulk-toolbar-copy">
              <strong>{bulk.count} selected</strong>
              <span>Apply the next step to the chosen shipment groups.</span>
            </div>
            <div className="bulk-toolbar-actions">
              <ActionButton type="button" tone="ghost" onClick={actions.onPrepareBulkComplete}>
                Complete
              </ActionButton>
              <ActionButton type="button" tone="ghost" onClick={actions.onPrepareBulkArchive}>
                Archive
              </ActionButton>
              <ActionButton type="button" tone="danger" onClick={actions.onPrepareBulkDelete}>
                Delete
              </ActionButton>
              <ActionButton type="button" tone="secondary" onClick={actions.onClearSelection}>
                Clear
              </ActionButton>
            </div>
          </section>
        ) : null}

        <div className="table-wrap dashboard-table-wrap" ref={table.tableWrapRef}>
          <table className="shipment-table dense-table">
            <colgroup>
              <col style={{ width: "var(--col-select)" }} />
              <col style={{ width: "var(--col-customer)" }} />
              <col style={{ width: "var(--col-containers)" }} />
              <col style={{ width: "var(--col-bl)" }} />
              <col style={{ width: "var(--col-status)" }} />
              <col style={{ width: "var(--col-movement)" }} />
              <col style={{ width: "var(--col-location)" }} />
              <col style={{ width: "var(--col-since)" }} />
              <col style={{ width: "var(--col-train)" }} />
              <col style={{ width: "var(--col-departure)" }} />
              <col style={{ width: "var(--col-do-date)" }} />
              <col style={{ width: "var(--col-doc-status)" }} />
              <col style={{ width: "var(--col-docs)" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="th-center selection-col">
                  <input
                    type="checkbox"
                    checked={table.allVisibleSelected}
                    onChange={actions.onToggleSelectAllVisible}
                    aria-label="Select all visible shipments"
                  />
                </th>
                <SortableHeader
                  label="Customer"
                  columnKey="customer_name"
                  sortConfig={table.sortConfig}
                  onSort={actions.onSort}
                  className="identity-col"
                />
                <SortableHeader label="Containers" columnKey="container_number" sortConfig={table.sortConfig} onSort={actions.onSort} />
                <SortableHeader label="BL" columnKey="bl_number" sortConfig={table.sortConfig} onSort={actions.onSort} />
                <SortableHeader label="Status" columnKey="shipment_status" sortConfig={table.sortConfig} onSort={actions.onSort} />
                <SortableHeader label="Movement" columnKey="movement_category" sortConfig={table.sortConfig} onSort={actions.onSort} />
                <SortableHeader label="Latest Location" columnKey="latest_location" sortConfig={table.sortConfig} onSort={actions.onSort} />
                <SortableHeader label="Movement Since" columnKey="movement_since_date" sortConfig={table.sortConfig} onSort={actions.onSort} />
                <SortableHeader label="Train No" columnKey="train_no" sortConfig={table.sortConfig} onSort={actions.onSort} />
                <SortableHeader label="Departure" columnKey="departure" sortConfig={table.sortConfig} onSort={actions.onSort} />
                <th>DO Date</th>
                <th>Document Status</th>
                <th className="th-center">Documents</th>
              </tr>
            </thead>
            <tbody>
              {table.loading ? (
                <tr>
                  <td colSpan="13" className="empty-cell">
                    Loading shipments...
                  </td>
                </tr>
              ) : table.rows.length === 0 ? (
                <tr>
                  <td colSpan="13" className="empty-cell">
                    No shipments match the current filters.
                  </td>
                </tr>
              ) : (
                table.rows.map((row) => {
                  const rowKey = String(row.group_key || row.id || "").trim();
                  const isSelected = table.selectedGroupKeys.includes(rowKey);
                  const isExpanded = table.expandedGroupKeys.includes(rowKey);
                  return (
                    <tr
                      key={row.group_key || row.id}
                      className={`interactive-row ${isSelected ? "is-selected" : ""} ${table.highlightedGroupKey === row.group_key ? "is-freshly-updated" : ""} ${row.destuffing_ready ? "is-destuffing-ready" : ""}`}
                      onClick={() => actions.onOpenAuditRow(row)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        actions.onOpenRowContextMenu(row, event);
                      }}
                    >
                      <td className="td-center selection-col" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => actions.onToggleGroupSelection(row)}
                          aria-label={`Select shipment ${row.bl_number || row.primary_container_number}`}
                        />
                      </td>
                      <td className="identity-col">
                        <div className="identity-cell">
                          <div className="cell-title customer-name">{row.customer_name || "-"}</div>
                          <OperationalStatusLine
                            blStatus={row.bl_surrender_status}
                            paymentStatus={row.payment_status}
                          />
                          <div className="identity-subline">
                            {row.bl_number ? `BL ${row.bl_number}` : "BL not linked"}
                          </div>
                          <RowActionSummary row={row} />
                        </div>
                      </td>
                      <td>
                        <ContainerChipList
                          row={row}
                          expanded={isExpanded}
                          className="container-list-cell"
                          showOverflowHint={false}
                          labelVariant="short"
                        />
                      </td>
                      <td>{row.bl_number || "-"}</td>
                      <td>
                        <span className={badgeClass("status", row.shipment_status)}>
                          {row.shipment_status || "unknown"}
                        </span>
                      </td>
                      <td>
                        <div className="movement-cell-stack">
                          <span className={badgeClass("movement", row.movement_category)}>
                            {row.movement_category || "Hi Seas"}
                          </span>
                        </div>
                      </td>
                      <td>{formatLocationLabel(row.latest_location) || "Not available"}</td>
                      <td className="date-cell">{row.movement_since_date || row.latest_time || "-"}</td>
                      <td>{row.train_no || "-"}</td>
                      <td className="date-cell">{row.departure || "-"}</td>
                      <td>
                        <div className="row-display-field">
                          <span className="row-display-label">DO Date</span>
                          <strong>{row.do_date || "Not set"}</strong>
                        </div>
                      </td>
                      <td>
                        <div className="row-display-field">
                          <span className="row-display-label">Status</span>
                          <strong>{formatDocumentStatusSummary(row)}</strong>
                        </div>
                      </td>
                      <td className="td-center">
                        <div className="docs-inline">
                          <span className={`docs-status ${row.documents_complete ? "is-complete" : ""}`}>
                            {row.documents_complete ? "Complete" : "Pending"}
                          </span>
                          <ActionButton
                            type="button"
                            tone="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              actions.onOpenDocuments(row);
                            }}
                          >
                            {row.documents_complete ? "Open Documents" : "Add Documents"}
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mobile-shipment-list">
          {table.loading ? (
            <div className="mobile-shipment-empty">Loading shipments...</div>
          ) : table.rows.length === 0 ? (
            <div className="mobile-shipment-empty">No shipments match the current filters.</div>
          ) : (
            table.rows.map((row) => {
              const rowKey = String(row.group_key || row.id || "").trim();
              return (
                <ClassicMobileShipmentCard
                  key={`mobile-${row.group_key || row.id}`}
                  row={row}
                  isSelected={table.selectedGroupKeys.includes(rowKey)}
                  isExpanded={table.expandedGroupKeys.includes(rowKey)}
                  onToggleSelection={actions.onToggleGroupSelection}
                  onOpenAuditRow={actions.onOpenAuditRow}
                  onOpenDocuments={actions.onOpenDocuments}
                  onOpenRowContextMenu={actions.onOpenRowContextMenu}
                />
              );
            })
          )}
        </div>
      </section>
    </>
  );
}

function PremiumPortalLandingView({ model, ownerPanel }) {
  const { hero, session, stats, metrics, filters, bulk, table, actions } = model;

  return (
    <>
      <section className="surface premium-landing-shell">
        <div className="premium-hero-top">
          <WorkspaceCluster onWorkspaceChange={actions.onWorkspaceChange} />
          <SessionCluster
            demoSessionEnabled={session.demoSessionEnabled}
            currentUser={session.currentUser}
            onOpenPassword={actions.onOpenPassword}
            onLogout={actions.onLogout}
          />
        </div>

        <div className="premium-hero-main">
          <div className="premium-hero-copy">
            <p className="eyebrow">Premium Workspace</p>
            <h1>Shipments, documents, and next actions in one calmer place.</h1>
            <p className="hero-copy">
              The new premium view keeps the live picture obvious first, then lets the team act without digging
              through dense tables.
            </p>
          </div>

          <div className="premium-hero-action-stack">
            <ActionButton type="button" tone="primary" onClick={actions.onRefreshTracking}>
              Refresh Live Shipments
            </ActionButton>
            <ActionButton type="button" tone="secondary" onClick={actions.onRefreshDashboard}>
              {hero.refreshing ? "Refreshing..." : "Refresh Dashboard"}
            </ActionButton>
            <label className="toggle-card premium-auto-refresh">
              <span className="toggle-copy">
                <strong>Auto Refresh</strong>
                <span>Every 5 minutes</span>
              </span>
              <input
                type="checkbox"
                checked={hero.autoRefresh}
                onChange={(event) => actions.onToggleAutoRefresh(event.target.checked)}
              />
            </label>
          </div>
        </div>

        <div className="premium-summary-grid">
          {stats.map((item, index) => (
            <PremiumSummaryCard
              key={item.key}
              label={item.label}
              value={item.value}
              helperText={item.helperText}
              tone={index === 0 ? "hero" : "default"}
              onClick={item.onClick}
            />
          ))}
        </div>
      </section>

      {ownerPanel}

      <section className="premium-metric-grid">
        {metrics.map((metric) => (
          <PremiumMetricCard key={metric.key} metric={metric} MovementIcon={MovementIcon} />
        ))}
      </section>

      <section className="surface premium-board-shell">
        <div className="premium-board-header">
          <div>
            <p className="eyebrow">Live Board</p>
            <h2>Shipment Focus</h2>
            <p className="panel-copy">
              {table.rows.length} shipment group{table.rows.length === 1 ? "" : "s"} visible right now. Sorted by{" "}
              {SORT_LABELS[table.sortConfig.key] || "movement"} {table.sortConfig.direction === "asc" ? "ascending" : "descending"}.
            </p>
          </div>
          <ActionButton type="button" tone="secondary" onClick={actions.onExportDashboard}>
            Download Report
          </ActionButton>
        </div>

        <div className="premium-control-rack">
          <div className="premium-movement-pills">
            {filters.movementOptions.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`premium-movement-pill ${filters.activeMovement === filter.value ? "is-active" : ""}`}
                onClick={() => actions.onMovementFilterChange(filter.value)}
              >
                <span>{filter.label}</span>
                <strong>{filter.count}</strong>
              </button>
            ))}
          </div>

          <div className="premium-filter-stack">
            <select
              className="premium-filter-select"
              value={filters.activeShipmentStatus}
              onChange={(event) => actions.onShipmentStatusFilterChange(event.target.value)}
            >
              {filters.shipmentStatusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            <input
              className="search-input premium-search-input"
              placeholder="Search customer, BL, container, place or train"
              value={filters.search}
              onChange={(event) => actions.onSearchChange(event.target.value)}
            />
          </div>
        </div>

        {bulk.count ? (
          <section className="bulk-toolbar premium-bulk-toolbar">
            <div className="bulk-toolbar-copy">
              <strong>{bulk.count} shipment groups selected</strong>
              <span>Move them together without dropping out of the live board.</span>
            </div>
            <div className="bulk-toolbar-actions">
              <ActionButton type="button" tone="ghost" onClick={actions.onPrepareBulkComplete}>
                Complete
              </ActionButton>
              <ActionButton type="button" tone="ghost" onClick={actions.onPrepareBulkArchive}>
                Archive
              </ActionButton>
              <ActionButton type="button" tone="danger" onClick={actions.onPrepareBulkDelete}>
                Delete
              </ActionButton>
              <ActionButton type="button" tone="secondary" onClick={actions.onClearSelection}>
                Clear
              </ActionButton>
            </div>
          </section>
        ) : null}

        {table.loading ? (
          <div className="premium-empty-state">
            <strong>Loading shipments...</strong>
            <span>The live board is preparing the latest movement view.</span>
          </div>
        ) : table.rows.length === 0 ? (
          <div className="premium-empty-state">
            <strong>No shipments match the current filters.</strong>
            <span>Try widening the movement, shipment status, or search filters.</span>
          </div>
        ) : (
          <div className="premium-shipment-grid">
            {table.rows.map((row) => {
              const rowKey = String(row.group_key || row.id || "").trim();
              const isSelected = table.selectedGroupKeys.includes(rowKey);
              const isExpanded = table.expandedGroupKeys.includes(rowKey);
              return (
                <PremiumShipmentCard
                  key={row.group_key || row.id}
                  row={row}
                  isSelected={isSelected}
                  isExpanded={isExpanded}
                  onToggleSelection={actions.onToggleGroupSelection}
                  onOpenAuditRow={actions.onOpenAuditRow}
                  onOpenRowContextMenu={actions.onOpenRowContextMenu}
                  onOpenDocuments={actions.onOpenDocuments}
                  badgeClass={badgeClass}
                  formatLocationLabel={formatLocationLabel}
                  formatDocumentStatusSummary={formatDocumentStatusSummary}
                  formatShipmentStatusLabel={formatShipmentStatusLabel}
                />
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

export function buildPortalLandingModel({
  demoSessionEnabled,
  currentUser,
  refreshing,
  autoRefresh,
  shipmentCounts,
  dashboardIdentifiers,
  movementCounts,
  movementFilter,
  shipmentStatusFilter,
  search,
  selectedRows,
  selectedGroupKeys,
  filteredRows,
  loading,
  highlightedGroupKey,
  allVisibleSelected,
  expandedGroupKeys,
  sortConfig,
  movementFilters,
  shipmentStatusFilters,
  tableWrapRef,
  actions,
}) {
  return {
    hero: {
      title: "Tracking Portal",
      refreshing,
      autoRefresh,
    },
    session: {
      demoSessionEnabled,
      currentUser,
    },
    stats: [
      {
        key: "total",
        label: "Total Shipments",
        value: shipmentCounts.total,
        helperText: "Across all shipment groups",
      },
      {
        key: "active",
        label: "Active",
        value: shipmentCounts.active,
        helperText: "Currently on the live board",
      },
      {
        key: "completed",
        label: "Completed",
        value: shipmentCounts.completed,
        helperText: "Open completion history",
        onClick: actions.onOpenCompleted,
      },
      {
        key: "archived",
        label: "Archived",
        value: shipmentCounts.archived,
        helperText: "Open archive register",
        onClick: actions.onOpenArchived,
      },
    ],
    metrics: [
      {
        key: "birgunj",
        label: "At Birgunj",
        value: dashboardIdentifiers.total_at_icd_birgunj || 0,
        tone: "primary",
        iconKind: "movement",
        iconType: "Arrived Birgunj",
        customers: [],
        helperText: "Current shipment groups already at Birgunj.",
      },
      {
        key: "today",
        label: "Arrived Today",
        value: dashboardIdentifiers.today_arrivals || 0,
        tone: "success",
        iconKind: "movement",
        iconType: "On Rail",
        customers: dashboardIdentifiers.today_arrival_customers || [],
        helperText: "Fresh arrivals captured today.",
      },
      {
        key: "approaching",
        label: "Near Birgunj",
        value: dashboardIdentifiers.approaching_birgunj || 0,
        tone: "warning",
        iconKind: "approaching",
        customers: dashboardIdentifiers.approaching_birgunj_customers || [],
        helperText: "Shipments likely to need attention soon.",
      },
      {
        key: "rail-week",
        label: "Started Rail This Week",
        value: dashboardIdentifiers.railed_out_this_week || 0,
        tone: "primary",
        iconKind: "rail-week",
        customers: dashboardIdentifiers.railed_out_this_week_customers || [],
        helperText: "Fresh inland movement started this week.",
      },
    ],
    filters: {
      movementOptions: movementFilters.map((filter) => ({
        ...filter,
        count: movementCounts[filter.value] || 0,
      })),
      activeMovement: movementFilter,
      activeShipmentStatus: shipmentStatusFilter,
      shipmentStatusOptions: shipmentStatusFilters,
      search,
    },
    bulk: {
      count: selectedRows.length,
      rows: selectedRows,
    },
    table: {
      rows: filteredRows,
      loading,
      sortConfig,
      selectedGroupKeys,
      allVisibleSelected,
      expandedGroupKeys,
      highlightedGroupKey,
      tableWrapRef,
    },
    actions,
  };
}

export default function PortalLandingExperience({ model, ownerPanel = null }) {
  const { preference } = useUIPreference();

  if (preference === "premium") {
    return <PremiumPortalLandingView model={model} ownerPanel={ownerPanel} />;
  }

  return <ClassicPortalLandingView model={model} ownerPanel={ownerPanel} />;
}

