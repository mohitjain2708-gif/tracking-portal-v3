import React, { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, isDemoSessionEnabled } from "./api";
import PortalLandingExperience, { buildPortalLandingModel } from "./views/portal/PortalLandingExperience";

const INITIAL_FORM = {
  customer_name: "",
  container_input: "",
  bl_number: "",
  clearance_doc_number: "",
  do_date: "",
  document_status: "",
  original_docs_received_date: "",
};

const INITIAL_MAPPING = {
  customer_name: "",
  container_number: "",
  bl_number: "",
};

const INITIAL_GOOGLE_SHEET_STATE = {
  source_url: "",
  available_sheets: [],
  selected_sheet: "",
  sheet_title: "",
  source_context: null,
  temp_file_token: "",
};

const INITIAL_PASSWORD_FORM = {
  current_password: "",
  new_password: "",
  confirm_password: "",
};

const IMPORT_FILE_SIZE_LIMIT_MB = 10;

const MOVEMENT_FILTERS = [
  { value: "All", label: "All" },
  { value: "Arrived Birgunj", label: "Arrived Birgunj" },
  { value: "On Rail", label: "On Rail" },
  { value: "At Port", label: "At Port" },
  { value: "Hi Seas", label: "Hi Seas" },
];

const DOCUMENT_FIELDS = [
  ["invoice", "Invoice"],
  ["packing_list", "Packing List"],
  ["bl_copy", "BL Copy"],
];

const DOCUMENT_STATUS_OPTIONS = ["", "Copy", "Original"];

const STATUS_OPTIONS = ["active", "completed", "archived"];
const SHIPMENT_STATUS_FILTERS = [
  { value: "all", label: "All Shipment Statuses" },
  { value: "action_needed", label: "Action Needed" },
  ...STATUS_OPTIONS.map((status) => ({
    value: status,
    label: status.charAt(0).toUpperCase() + status.slice(1),
  })),
];
const MAPPING_FIELDS = [
  ["customer_name", "Customer Name"],
  ["container_number", "Container Number"],
  ["bl_number", "BL Number"],
];

const MOVEMENT_PRIORITY = {
  "Arrived Birgunj": 4,
  "On Rail": 3,
  "At Port": 2,
  "Hi Seas": 1,
};

function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseContainerInput(value) {
  return Array.from(
    new Set(
      cleanText(value)
        .toUpperCase()
        .split(/[\s,;]+/)
        .map((item) => cleanText(item))
        .filter(Boolean)
    )
  );
}

function isValidContainerNumber(value) {
  return /^[A-Z]{4}\d{7}$/.test(cleanText(value).toUpperCase());
}

function toInputDateValue(value) {
  const text = cleanText(value);
  if (!text) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  const parts = text.split("-");
  if (parts.length === 3 && parts[0].length === 2) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return "";
}

function fromInputDateValue(value) {
  const text = cleanText(value);
  if (!text) {
    return "";
  }
  const parts = text.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return text;
}

function hasDoDateDraftChanges(row, draft) {
  return toInputDateValue(row?.do_date) !== cleanText(draft?.do_date);
}

function hasDocumentDraftChanges(row, draft) {
  const currentStatus = cleanText(row?.document_status);
  const draftStatus = cleanText(draft?.document_status);
  if (currentStatus !== draftStatus) {
    return true;
  }
  return toInputDateValue(row?.original_docs_received_date) !== cleanText(draft?.original_docs_received_date);
}

function formatDocumentStatusSummary(row) {
  const status = cleanText(row?.document_status);
  if (!status) {
    return "Not set";
  }
  if (status === "Original" && cleanText(row?.original_docs_received_date)) {
    return `Original - ${row.original_docs_received_date}`;
  }
  return status;
}

function formatShipmentDetailSummary(row) {
  const movement = normalizeMovementCategory(row?.movement_category) || "Hi Seas";
  const location = formatLocationLabel(row?.latest_location);

  if (movement === "Completed") {
    return "This shipment cycle has already been served and closed for the customer.";
  }
  if (movement === "Arrived Birgunj") {
    return location
      ? `The current shipment cycle has reached Birgunj. Latest confirmed location: ${location}.`
      : "The current shipment cycle has reached Birgunj and is ready for the next operational step.";
  }
  if (movement === "On Rail") {
    return location
      ? `The shipment is still inland and moving toward Birgunj. Latest tracked location: ${location}.`
      : "The shipment is still inland and moving toward Birgunj.";
  }
  if (movement === "At Port") {
    return location
      ? `The shipment has reached port and is waiting for the inland handoff. Latest port context: ${location}.`
      : "The shipment has reached port and is waiting for the inland handoff.";
  }
  return "The shipment has not yet entered a confirmed inland cycle, so we are treating it as hi seas for now.";
}

function toLocationTitleCase(value) {
  const raw = cleanText(value);
  if (!raw) {
    return "";
  }

  return raw
    .split(" ")
    .map((word) => {
      if (!word) {
        return "";
      }
      if (/^[A-Z0-9/-]{2,}$/.test(word) && !/[a-z]/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function formatLocationLabel(value) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return "";
  }

  const parts = cleaned
    .split(/\s*[|/;]\s*/)
    .map((part) => part.replace(/^at:\s*/i, "").trim())
    .filter(Boolean)
    .filter((part) => !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(part))
    .filter((part) => !/^at$/i.test(part));

  const normalizedParts = [];
  const seen = new Set();
  parts.forEach((part) => {
    const normalized = part.replace(/\s+/g, " ").trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return;
    }
    seen.add(key);
    normalizedParts.push(toLocationTitleCase(normalized));
  });

  return normalizedParts.join(" / ");
}

function normalizeLooseText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIdentifierText(value) {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function isLikelyIdentifierQuery(value) {
  const raw = cleanText(value);
  const normalized = normalizeIdentifierText(raw);
  return !/\s/.test(raw) && normalized.length >= 4 && /\d/.test(normalized);
}

function rowMatchesSearch(row, query) {
  const cleanedQuery = cleanText(query);
  if (!cleanedQuery) {
    return true;
  }

  if (isLikelyIdentifierQuery(cleanedQuery)) {
    const identifierQuery = normalizeIdentifierText(cleanedQuery);
    const identifierFields = [
      row.primary_container_number,
      row.bl_number,
      row.train_no,
      ...(row.container_numbers || []),
    ]
      .map((value) => normalizeIdentifierText(value))
      .filter(Boolean);

    return identifierFields.some(
      (value) => value === identifierQuery || value.includes(identifierQuery)
    );
  }

  const looseQuery = normalizeLooseText(cleanedQuery);
  const searchableText = normalizeLooseText(
    [
      row.customer_name,
      row.bl_number,
      row.latest_location,
      row.train_no,
      row.shipment_status,
      row.movement_category,
      row.clearance_doc_number,
      ...(row.container_numbers || []),
    ].join(" ")
  );
  return searchableText.includes(looseQuery);
}

function formatShipmentStatusLabel(value) {
  const status = cleanText(value).toLowerCase();
  if (status === "active") {
    return "Live";
  }
  if (!status) {
    return "-";
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatRefreshStatusLabel(value) {
  const status = cleanText(value).toLowerCase();
  if (!status || status === "unknown") {
    return "Awaiting live check";
  }
  if (status === "success") {
    return "Checked successfully";
  }
  if (status === "success-cached") {
    return "Loaded from cache";
  }
  if (status === "error") {
    return "Needs attention";
  }
  if (status === "not_refreshed") {
    return "Awaiting live check";
  }
  return status
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeMovementDiagnostics(value) {
  const diagnostics = value && typeof value === "object" ? value : {};
  const evidence = Array.isArray(diagnostics.evidence)
    ? diagnostics.evidence
        .map((item) => ({
          label: cleanText(item?.label),
          value: cleanText(item?.value),
        }))
        .filter((item) => item.label && item.value)
    : [];

  return {
    resolution_summary: cleanText(diagnostics.resolution_summary),
    source_priority_summary: cleanText(diagnostics.source_priority_summary),
    group_scope_summary: cleanText(diagnostics.group_scope_summary),
    action_summary: cleanText(diagnostics.action_summary),
    evidence,
  };
}

function formatTrackingSourceLabel(value) {
  const normalized = cleanText(value)
    .split(/[,+]/)
    .map((item) => cleanText(item).toLowerCase())
    .filter(Boolean);
  if (normalized.length === 0) {
    return "No source recorded yet";
  }

  const labels = normalized.map((item) => {
    if (item === "ldb") {
      return "LDB";
    }
    if (item === "concor") {
      return "CONCOR";
    }
    if (item === "pristine") {
      return "Pristine";
    }
    return item.charAt(0).toUpperCase() + item.slice(1);
  });

  if (labels.length === 1) {
    return labels[0];
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function applyOperationalFieldUpdate(current, updates = {}) {
  if (!current) {
    return current;
  }
  return {
    ...current,
    clearance_doc_number: updates.clearance_doc_number ?? current.clearance_doc_number ?? "",
    do_date: updates.do_date ?? current.do_date ?? "",
    document_status: updates.document_status ?? current.document_status ?? "",
    original_docs_received_date:
      updates.original_docs_received_date ?? current.original_docs_received_date ?? "",
  };
}

function applyShipmentOverlayUpdate(current, referenceRow, shipmentStatus, extra = {}) {
  if (!current || current.group_key !== referenceRow.group_key) {
    return current;
  }
  return {
    ...applyOperationalFieldUpdate(current, extra),
    shipment_status: shipmentStatus,
  };
}

function formatImportCompletionText(data) {
  const imported = Number(data?.imported_count ?? 0);
  const duplicateCount = Number(data?.duplicate_count ?? 0);
  const skippedBlankCount = Number(data?.skipped_blank_count ?? 0);
  const skippedInvalidCount = Number(data?.skipped_invalid_count ?? 0);
  const skippedTotal = duplicateCount + skippedBlankCount + skippedInvalidCount;
  const detailParts = [];

  if (duplicateCount > 0) {
    detailParts.push(`${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}`);
  }
  if (skippedBlankCount > 0) {
    detailParts.push(`${skippedBlankCount} blank row${skippedBlankCount === 1 ? "" : "s"}`);
  }
  if (skippedInvalidCount > 0) {
    detailParts.push(`${skippedInvalidCount} invalid container${skippedInvalidCount === 1 ? "" : "s"}`);
  }

  const summary = imported === 1 ? "1 shipment added." : `${imported} shipments added.`;
  const detail = skippedTotal > 0 ? ` ${skippedTotal} row${skippedTotal === 1 ? "" : "s"} left out.` : "";
  const warning = data?.source_tracking_warning ? ` ${data.source_tracking_warning}` : "";
  return `${summary}${detail}${warning}`.trim();
}

function formatAuditActionLabel(value) {
  const action = cleanText(value).toLowerCase();
  const custom = {
    shipment_group_refreshed: "Shipment group refreshed",
    shipment_all_refreshed: "All active shipments refreshed",
    shipment_imported: "Shipment import completed",
    shipment_status_updated: "Shipment status updated",
    shipment_group_restored: "Shipment restored to live dashboard",
    shipment_group_deleted: "Shipment group removed",
    shipment_document_uploaded: "Document submitted",
    shipment_orphans_reconciled: "Legacy duplicates cleaned",
    shipment_added: "Shipment added",
    shipment_group_edited: "Shipment details corrected",
  };
  if (custom[action]) {
    return custom[action];
  }
  if (!action) {
    return "-";
  }
  return action
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAuditDetails(details) {
  if (!details || typeof details !== "object") {
    return "No additional detail";
  }

  if (details.previous_bl_number !== undefined || details.next_bl_number !== undefined) {
    const changes = [];
    if (details.previous_bl_number !== details.next_bl_number) {
      changes.push(
        `BL updated from ${details.previous_bl_number || "not linked"} to ${details.next_bl_number || "not linked"}`
      );
    }
    if (details.customer_name) {
      changes.push(`customer aligned to ${details.customer_name}`);
    }
    if (Array.isArray(details.container_numbers) && details.container_numbers.length) {
      changes.push(`${details.container_numbers.length} containers now linked`);
    }
    return `${changes.join(". ")}.`;
  }

  if (Array.isArray(details.container_numbers) && details.container_numbers.length) {
    if (typeof details.refreshed_count === "number") {
      return `${details.refreshed_count} shipments refreshed: ${details.container_numbers.join(", ")}`;
    }
    return `Containers: ${details.container_numbers.join(", ")}`;
  }

  if (typeof details.deleted_count === "number") {
    return `${details.deleted_count} duplicate shipment rows cleaned up.`;
  }

  if (typeof details.imported_count === "number") {
    return `${details.imported_count} imported, ${details.duplicate_count || 0} duplicates skipped, ${details.skipped_blank_count || 0} blank rows ignored, and ${details.skipped_invalid_count || 0} invalid containers skipped.`;
  }

  if (details.document_type || details.original_name) {
    const label = details.document_type
      ? details.document_type.replace(/_/g, " ")
      : "document";
    const prettyLabel = label
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    return `${prettyLabel}${details.original_name ? ` uploaded as ${details.original_name}` : " uploaded"}.`;
  }

  if (details.refreshed_count) {
    return `${details.refreshed_count} shipments refreshed.`;
  }

  return Object.entries(details)
    .map(([key, val]) => `${key.replace(/_/g, " ")}: ${Array.isArray(val) ? val.join(", ") : String(val)}`)
    .join(" · ");
}

function formatDateTimeLabel(value) {
  const text = cleanText(value);
  if (!text) {
    return "-";
  }

  const legacyMatch = text.match(
    /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  let parsed = legacyMatch
    ? new Date(
        Number(legacyMatch[3]),
        Number(legacyMatch[2]) - 1,
        Number(legacyMatch[1]),
        Number(legacyMatch[4] || 0),
        Number(legacyMatch[5] || 0),
        Number(legacyMatch[6] || 0)
      )
    : new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }

  return new Intl.DateTimeFormat(undefined, {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
}

function guessColumns(columns) {
  const availableColumns = Array.isArray(columns) ? columns : [];

  const guess = (patterns) =>
    availableColumns.find((column) =>
      patterns.some((pattern) => String(column).toLowerCase().includes(pattern))
    ) || "";

  return {
    customer_name: guess(["customer", "party", "consignee", "customer name"]),
    container_number: guess(["container", "cntr", "container no", "container number"]),
    bl_number: guess(["bl", "bill of lading", "bl no"]),
  };
}

function normalizeMovementCategory(value) {
  const movement = cleanText(value);
  if (!movement || movement === "High Seas") {
    return "Hi Seas";
  }
  if (movement === "Arrived") {
    return "Arrived Birgunj";
  }
  if (movement === "Moving" || movement === "In Transit") {
    return "On Rail";
  }
  if (movement === "At Origin" || movement === "Delayed") {
    return "At Port";
  }
  return movement;
}

function badgeClass(type, value) {
  const key = String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `badge badge-${type} badge-${type}-${key || "unknown"}`;
}

function compareDateStrings(left, right) {
  const toValue = (value) => {
    const text = cleanText(value);
    if (!text) {
      return 0;
    }
    const [day, month, year] = text.split("-").map(Number);
    if (!day || !month || !year) {
      return 0;
    }
    return new Date(year, month - 1, day).getTime();
  };

  return toValue(left) - toValue(right);
}

function earliestDateString(values) {
  const dates = (Array.isArray(values) ? values : []).filter((value) => cleanText(value));
  if (!dates.length) {
    return "";
  }
  return [...dates].sort((left, right) => compareDateStrings(left, right))[0] || "";
}

function compareValues(left, right, key) {
  if (key === "latest_time" || key === "departure" || key === "movement_since_date") {
    return compareDateStrings(left, right);
  }

  if (key === "movement_category") {
    return (MOVEMENT_PRIORITY[left] || 0) - (MOVEMENT_PRIORITY[right] || 0);
  }

  if (typeof left === "number" || typeof right === "number") {
    return Number(left || 0) - Number(right || 0);
  }

  return cleanText(left).localeCompare(cleanText(right), undefined, { sensitivity: "base" });
}

function rowMatchesShipment(row, shipment) {
  const shipmentContainer = cleanText(shipment.container_number).toUpperCase();
  const rowBL = cleanText(row.bl_number).toUpperCase();
  const shipmentBL = cleanText(shipment.bl_number).toUpperCase();
  const rowContainers = (row.container_numbers || []).map((value) => cleanText(value).toUpperCase());

  if (rowBL) {
    return shipmentBL === rowBL;
  }

  return rowContainers.includes(shipmentContainer);
}

function buildGroupedRowsFromShipments(shipments, statusFilter = null) {
  const grouped = {};
  (Array.isArray(shipments) ? shipments : []).forEach((shipment) => {
    if (statusFilter && shipment.shipment_status !== statusFilter) {
      return;
    }
    const normalizedBl = cleanText(shipment.bl_number).toUpperCase().replace(/\s+/g, "");
    const groupKey = normalizedBl ? `BL:${normalizedBl}` : `SHIP:${shipment.id}`;
    if (!grouped[groupKey]) {
      grouped[groupKey] = [];
    }
    grouped[groupKey].push({
      ...shipment,
      movement_category: normalizeMovementCategory(shipment.movement_category),
    });
  });

  return Object.entries(grouped)
    .map(([groupKey, entries]) => {
      const sortedEntries = [...entries].sort((left, right) => {
        const movementDiff =
          (MOVEMENT_PRIORITY[right.movement_category] || 0) - (MOVEMENT_PRIORITY[left.movement_category] || 0);
        if (movementDiff !== 0) {
          return movementDiff;
        }
        const dateDiff = compareDateStrings(right.latest_time, left.latest_time);
        if (dateDiff !== 0) {
          return dateDiff;
        }
        return (right.id || 0) - (left.id || 0);
      });
      const lead = sortedEntries[0];
      const containerNumbers = Array.from(
        new Set(sortedEntries.map((item) => cleanText(item.container_number)).filter(Boolean))
      ).sort();
      return {
        group_key: groupKey,
        id: lead.id,
        customer_name: cleanText(lead.customer_name) || "-",
        primary_container_number: cleanText(lead.container_number),
        container_numbers: containerNumbers,
        container_count: containerNumbers.length,
        bl_number: cleanText(lead.bl_number),
        shipment_status: cleanText(lead.shipment_status) || "active",
        movement_category: lead.movement_category || "Hi Seas",
        latest_location: cleanText(lead.latest_location),
        latest_time: cleanText(lead.latest_time),
        movement_since_date: earliestDateString(sortedEntries.map((item) => cleanText(item.movement_since_date))),
        port_arrival_date: earliestDateString(sortedEntries.map((item) => cleanText(item.port_arrival_date))),
        train_no: cleanText(lead.train_no),
        departure: cleanText(lead.departure),
        tracking_source: cleanText(lead.tracking_source),
        source_type: cleanText(lead.source_type),
        source_label: cleanText(lead.source_label),
        source_batch_id: Number(lead.source_batch_id || 0),
        last_refresh_at: cleanText(lead.last_refresh_at),
        last_refresh_status: cleanText(lead.last_refresh_status),
        last_refresh_error: cleanText(lead.last_refresh_error),
        clearance_doc_number: cleanText(lead.clearance_doc_number),
        action_required: Boolean(sortedEntries.some((item) => item.action_required)),
        action_required_reason: cleanText(
          sortedEntries.find((item) => cleanText(item.action_required_reason))?.action_required_reason
        ),
        movement_diagnostics: {
          ...normalizeMovementDiagnostics(lead.movement_diagnostics),
          group_scope_summary: `The dashboard is showing the strongest live movement across ${containerNumbers.length || 1} container${containerNumbers.length === 1 ? "" : "s"} in this BL group.`,
        },
        raw_shipments: sortedEntries,
      };
    })
    .sort((left, right) => compareDateStrings(right.latest_time, left.latest_time));
}

function compareLocationByDistance(leftLocation, rightLocation, distanceMap) {
  const leftText = cleanText(leftLocation);
  const rightText = cleanText(rightLocation);

  if (!leftText && !rightText) {
    return 0;
  }
  if (!leftText) {
    return 1;
  }
  if (!rightText) {
    return -1;
  }

  const leftInfo = distanceMap[leftText] || {};
  const rightInfo = distanceMap[rightText] || {};
  const leftFound = Boolean(leftInfo.found) && Number.isFinite(leftInfo.distance_km);
  const rightFound = Boolean(rightInfo.found) && Number.isFinite(rightInfo.distance_km);

  if (leftFound && !rightFound) {
    return -1;
  }
  if (!leftFound && rightFound) {
    return 1;
  }
  if (leftFound && rightFound && leftInfo.distance_km !== rightInfo.distance_km) {
    return leftInfo.distance_km - rightInfo.distance_km;
  }

  return leftText.localeCompare(rightText, undefined, { sensitivity: "base" });
}

function exportRowsAsCsv(fileName, rows, columns) {
  const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [
    columns.map((column) => escapeCsv(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(column.value(row))).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
}

function StatCard({ label, value, onClick, helperText, motionIndex = 0 }) {
  const Element = onClick ? "button" : "article";
  return (
    <Element
      className={`stat-card motion-stagger-item ${onClick ? "stat-card-interactive" : ""}`}
      onClick={onClick}
      type={onClick ? "button" : undefined}
      style={{ "--motion-index": motionIndex }}
    >
      <p className="stat-label">{label}</p>
      <strong className="stat-value">{value}</strong>
      {helperText ? <span className="stat-helper">{helperText}</span> : null}
    </Element>
  );
}

function IntakeLauncherCard({ eyebrow, title, description, isActive, onClick, motionIndex = 0 }) {
  return (
    <button
      type="button"
      className={`intake-launcher-card motion-stagger-item${isActive ? " is-active" : ""}`}
      onClick={onClick}
      style={{ "--motion-index": motionIndex }}
    >
      <span className="eyebrow">{eyebrow}</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </button>
  );
}

function ActionButton({ children, tone = "default", compact = false, ...props }) {
  return (
    <button className={`button button-${tone}${compact ? " button-compact" : ""}`} {...props}>
      {children}
    </button>
  );
}

function AuditDisclosure({ title, summary = "", open = false, onToggle, children }) {
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

function MovementIcon({ type }) {
  if (type === "Arrived Birgunj") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }

  if (type === "At Port") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="5" r="1.7" />
        <path d="M12 7v10" />
        <path d="M8 10h8" />
        <path d="M6 14a6 6 0 0 0 12 0" />
        <path d="M9 17l-2.5 2M15 17l2.5 2" />
      </svg>
    );
  }

  if (type === "On Rail") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4h10c1.7 0 3 1.3 3 3v7c0 1.7-1.3 3-3 3H7c-1.7 0-3-1.3-3-3V7c0-1.7 1.3-3 3-3Z" />
        <path d="M7 17l-2 3M17 17l2 3M8 20h8M7 8h10M7 12h10" />
        <circle cx="8" cy="15" r="1" />
        <circle cx="16" cy="15" r="1" />
      </svg>
    );
  }

  if (type === "Hi Seas") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 16h16M7 16V9l5-2 5 2v7M12 7v9" />
        <path d="M3 19c1 .8 2 .8 3.1 0 1.1-.8 2-.8 3.1 0 1.1.8 2 .8 3.1 0 1.1-.8 2-.8 3.1 0 1.1.8 2 .8 3.1 0" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

function MovementIdentifier({ filter, isActive, count, onClick, motionIndex = 0 }) {
  return (
    <button
      type="button"
      className={`movement-identifier motion-stagger-item ${isActive ? "is-active" : ""}`}
      onClick={onClick}
      style={{ "--motion-index": motionIndex }}
    >
      <span className="movement-identifier-icon">
        <MovementIcon type={filter.value} />
      </span>
      <span className="movement-identifier-copy">
        <strong>{filter.label}</strong>
        <span>{count}</span>
      </span>
    </button>
  );
}

function DashboardMetric({ label, value, tone = "default", icon, customers = [], motionIndex = 0 }) {
  const getCount = (item) => item?.shipment_count ?? item?.container_count ?? 0;
  return (
    <article
      className={`dashboard-metric motion-stagger-item dashboard-metric-${tone}`}
      style={{ "--motion-index": motionIndex }}
      title={
        customers.length
          ? customers.map((item) => `${item.customer_name} - ${getCount(item)}`).join(", ")
          : ""
      }
    >
      <span className="dashboard-metric-icon">{icon}</span>
      <span className="dashboard-metric-copy">
        <strong>{label}</strong>
        <span>{value}</span>
      </span>
      {customers.length > 0 && (
        <div className="dashboard-metric-tooltip" role="tooltip">
          <p>{label}</p>
          <ul>
            {customers.map((item) => (
              <li key={item.customer_name}>
                <span>{item.customer_name}</span>
                <strong>{getCount(item)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function SortableHeader({ label, columnKey, sortConfig, onSort, className = "" }) {
  const isActive = sortConfig.key === columnKey;
  const indicator = !isActive ? "↕" : sortConfig.direction === "asc" ? "↑" : "↓";

  return (
    <th className={className}>
      <button
        type="button"
        className={`header-sort ${isActive ? "is-active" : ""}`}
        onClick={() => onSort(columnKey)}
      >
        <span>{label}</span>
        <span className="header-sort-indicator">{indicator}</span>
      </button>
    </th>
  );
}

function Modal({ title, onClose, children, actions = null, size = "default" }) {
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

function AuthScreen({
  mode,
  form,
  loading,
  feedback,
  onModeChange,
  onFieldChange,
  onSubmit,
}) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Secure Access</p>
        <h1>Shipment Manager Portal</h1>
        <p className="auth-copy">
          Sign in to work in your own shipment workspace.
        </p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => onFieldChange("email", event.target.value)}
              placeholder="owner@trackingportal.app"
              autoComplete="username"
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => onFieldChange("password", event.target.value)}
              placeholder="Enter your password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>
          {mode === "register" && (
            <label>
              <span>Confirm Password</span>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => onFieldChange("confirmPassword", event.target.value)}
                placeholder="Confirm your password"
                autoComplete="new-password"
                required
              />
            </label>
          )}
          <button type="submit" className="button button-primary auth-submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
        {feedback ? (
          <div className={`feedback feedback-${feedback.tone}`}>
            {feedback.text}
          </div>
        ) : null}
        <div className="auth-switch">
          <span>{mode === "login" ? "Need an account?" : "Already have an account?"}</span>
          <button type="button" className="auth-link" onClick={onModeChange}>
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </div>
      </section>
    </main>
  );
}

function App() {
  const demoSessionEnabled = isDemoSessionEnabled();
  const tableWrapRef = useRef(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(demoSessionEnabled);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authForm, setAuthForm] = useState({ email: "", password: "", confirmPassword: "" });
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState(INITIAL_PASSWORD_FORM);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [adminOverview, setAdminOverview] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminResetState, setAdminResetState] = useState({ userId: 0, password: "" });
  const [adminResetSubmitting, setAdminResetSubmitting] = useState(false);
  const [ownerUserShipments, setOwnerUserShipments] = useState(null);
  const [ownerUserShipmentsLoading, setOwnerUserShipmentsLoading] = useState(false);
  const [ownerDeleteUser, setOwnerDeleteUser] = useState(null);
  const [ownerDeletingUser, setOwnerDeletingUser] = useState(false);
  const [shipments, setShipments] = useState([]);
  const [shipmentListLoading, setShipmentListLoading] = useState(false);
  const [shipmentsHydrated, setShipmentsHydrated] = useState(false);
  const [dashboardRows, setDashboardRows] = useState([]);
  const [dashboardIdentifiers, setDashboardIdentifiers] = useState({
    total_at_icd_birgunj: 0,
    today_arrivals: 0,
    approaching_birgunj: 0,
    railed_out_this_week: 0,
    today_arrival_customers: [],
    approaching_birgunj_customers: [],
    railed_out_this_week_customers: [],
  });
  const [shipmentCountSummary, setShipmentCountSummary] = useState({
    active: 0,
    completed: 0,
    archived: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [manualForm, setManualForm] = useState(INITIAL_FORM);
  const [activeIntakePanel, setActiveIntakePanel] = useState(null);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [shipmentImportFile, setShipmentImportFile] = useState(null);
  const [shipmentImportPreview, setShipmentImportPreview] = useState(null);
  const [shipmentImportMapping, setShipmentImportMapping] = useState(INITIAL_MAPPING);
  const [shipmentImporting, setShipmentImporting] = useState(false);
  const [shipmentImportReviewRows, setShipmentImportReviewRows] = useState([]);
  const [shipmentImportReviewSummary, setShipmentImportReviewSummary] = useState(null);
  const [shipmentImportReviewOpen, setShipmentImportReviewOpen] = useState(false);
  const [sourceBatches, setSourceBatches] = useState([]);
  const [sourceBatchDetail, setSourceBatchDetail] = useState(null);
  const [sourceMappings, setSourceMappings] = useState([]);
  const [sourceConnections, setSourceConnections] = useState([]);
  const [googleSheetState, setGoogleSheetState] = useState(INITIAL_GOOGLE_SHEET_STATE);
  const [googleSheetLoading, setGoogleSheetLoading] = useState(false);
  const [shipmentImportSourceContext, setShipmentImportSourceContext] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [search, setSearch] = useState("");
  const [movementFilter, setMovementFilter] = useState("All");
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState({ key: "movement_since_date", direction: "desc" });
  const [documentUploadState, setDocumentUploadState] = useState({});
  const [locationDistanceMap, setLocationDistanceMap] = useState({});
  const [selectedGroupKeys, setSelectedGroupKeys] = useState([]);
  const [stickyHeaderActive, setStickyHeaderActive] = useState(false);
  const [stickyHeaderStyle, setStickyHeaderStyle] = useState({ left: 0, width: 0, scrollLeft: 0 });
  const [actionRow, setActionRow] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [clearancePrompt, setClearancePrompt] = useState(null);
  const [clearanceDocNumber, setClearanceDocNumber] = useState("");
  const [trackingRefreshActive, setTrackingRefreshActive] = useState(false);
  const [trackingRefreshProgress, setTrackingRefreshProgress] = useState(0);
  const trackingRefreshPollRef = useRef(null);
  const dashboardLoadPromiseRef = useRef(null);
  const shipmentListLoadPromiseRef = useRef(null);
  const rowHighlightTimeoutRef = useRef(null);
  const locationDistanceCacheRef = useRef({});
  const [documentRow, setDocumentRow] = useState(null);
  const [recordsView, setRecordsView] = useState(null);
  const [recordsSearch, setRecordsSearch] = useState("");
  const [recordsMovementFilter, setRecordsMovementFilter] = useState("All");
  const deferredSearch = useDeferredValue(search);
  const deferredRecordsSearch = useDeferredValue(recordsSearch);
  const [bulkConfirmAction, setBulkConfirmAction] = useState(null);
  const [bulkClearanceMap, setBulkClearanceMap] = useState({});
  const [quickEditRow, setQuickEditRow] = useState(null);
  const [rowContextMenu, setRowContextMenu] = useState(null);
  const [auditRow, setAuditRow] = useState(null);
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditJournalExpanded, setAuditJournalExpanded] = useState(false);
  const [auditRelatedCyclesExpanded, setAuditRelatedCyclesExpanded] = useState(false);
  const [auditControlsExpanded, setAuditControlsExpanded] = useState(false);
  const [actionReturnRow, setActionReturnRow] = useState(null);
  const [editReturnRow, setEditReturnRow] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm, setEditForm] = useState(INITIAL_FORM);
  const [fieldSavingKeys, setFieldSavingKeys] = useState({});
  const [highlightedGroupKey, setHighlightedGroupKey] = useState("");
  const [operationalDrafts, setOperationalDrafts] = useState({});
  const [documentFiles, setDocumentFiles] = useState({
    invoice: null,
    packing_list: null,
    bl_copy: null,
  });

  const handleWorkspaceChange = useCallback((event) => {
    const nextWorkspace = cleanText(event.target.value);
    if (nextWorkspace === "tax-table") {
      window.location.assign("/tax-table-utility.html");
    }
  }, []);

  useEffect(() => {
    const { pathname, search } = window.location;
    if (pathname.startsWith("/api/shipments/bl-documents/file")) {
      window.history.replaceState({}, "", "/");
      return;
    }
    if (pathname.startsWith("/api/")) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    let active = true;

    if (demoSessionEnabled) {
      setAuthChecked(true);
      setIsAuthenticated(true);
      return undefined;
    }

    if (!api.hasSession()) {
      setAuthChecked(true);
      setIsAuthenticated(false);
      setLoading(false);
      return undefined;
    }

    api
      .me()
      .then((user) => {
        if (!active) {
          return;
        }
        setCurrentUser(user);
        setIsAuthenticated(true);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        api.logout();
        setCurrentUser(null);
        setIsAuthenticated(false);
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setAuthChecked(true);
      });

    return () => {
      active = false;
    };
  }, [demoSessionEnabled]);

  useEffect(() => {
    setPasswordModalOpen(Boolean(currentUser?.password_reset_required));
  }, [currentUser]);

  useEffect(() => {
    let active = true;
    if (!currentUser?.is_admin || !isAuthenticated) {
      setAdminOverview(null);
      return undefined;
    }
    setAdminLoading(true);
    api
      .getAdminOverview()
      .then((data) => {
        if (active) {
          setAdminOverview(data);
        }
      })
      .catch(() => {
        if (active) {
          setAdminOverview(null);
        }
      })
      .finally(() => {
        if (active) {
          setAdminLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [currentUser, isAuthenticated]);

  const loadShipmentList = useCallback(async (options = {}) => {
    const { silent = false, force = false } = options;

    if (!demoSessionEnabled && (!authChecked || !isAuthenticated)) {
      setShipmentListLoading(false);
      return [];
    }

    if (!force && shipmentListLoadPromiseRef.current) {
      return shipmentListLoadPromiseRef.current;
    }

    if (!silent) {
      setShipmentListLoading(true);
    }

    const requestPromise = (async () => {
      try {
        const items = await api.listShipments();
        const nextShipments = Array.isArray(items) ? items : [];
        startTransition(() => {
          setShipments(nextShipments);
          setShipmentsHydrated(true);
        });
        return nextShipments;
      } catch (error) {
        if (!silent) {
          setFeedback({ tone: "error", text: error.message || "Failed to load shipment details" });
        }
        return [];
      } finally {
        shipmentListLoadPromiseRef.current = null;
        setShipmentListLoading(false);
      }
    })();

    shipmentListLoadPromiseRef.current = requestPromise;
    return requestPromise;
  }, [authChecked, demoSessionEnabled, isAuthenticated]);

  const loadDashboard = useCallback(async (options = {}) => {
    const { silent = false, includeSources = !silent, includeShipments = false } = options;

    if (!demoSessionEnabled && (!authChecked || !isAuthenticated)) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (dashboardLoadPromiseRef.current) {
      return dashboardLoadPromiseRef.current;
    }

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const requestPromise = (async () => {
      try {
        const bootstrap = await api.getPortalBootstrap({ includeSources, includeShipments });
        const nextShipments = Array.isArray(bootstrap?.shipments) ? bootstrap.shipments : [];
        const nextDashboardRows = Array.isArray(bootstrap?.dashboard?.rows) ? bootstrap.dashboard.rows : [];
        const nextDashboardIdentifiers = bootstrap?.dashboard?.identifiers || {
          total_at_icd_birgunj: 0,
          today_arrivals: 0,
          approaching_birgunj: 0,
          railed_out_this_week: 0,
          today_arrival_customers: [],
          approaching_birgunj_customers: [],
          railed_out_this_week_customers: [],
        };
        const nextShipmentCountSummary = bootstrap?.dashboard?.shipment_counts || {
          active: nextDashboardRows.length,
          completed: 0,
          archived: 0,
          total: nextDashboardRows.length,
        };

        startTransition(() => {
          setDashboardRows(nextDashboardRows);
          setDashboardIdentifiers(nextDashboardIdentifiers);
          setShipmentCountSummary(nextShipmentCountSummary);
          if (includeShipments) {
            setShipments(nextShipments);
            setShipmentsHydrated(true);
          }
          if (includeSources) {
            setSourceBatches(Array.isArray(bootstrap?.source_batches) ? bootstrap.source_batches : []);
            setSourceMappings(Array.isArray(bootstrap?.source_mappings) ? bootstrap.source_mappings : []);
            setSourceConnections(Array.isArray(bootstrap?.source_connections) ? bootstrap.source_connections : []);
          }
        });
      } catch (error) {
        if (!demoSessionEnabled && /authentication|unauthorized|missing authentication token/i.test(error.message || "")) {
          api.logout();
          setCurrentUser(null);
          setIsAuthenticated(false);
        }
        if (!silent) {
          setFeedback({ tone: "error", text: error.message || "Failed to load shipments" });
        }
      } finally {
        dashboardLoadPromiseRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    })();

    dashboardLoadPromiseRef.current = requestPromise;
    return requestPromise;
  }, [authChecked, demoSessionEnabled, isAuthenticated]);

  const refreshDashboardLight = useCallback(
    () => loadDashboard({ silent: true, includeSources: false }),
    [loadDashboard]
  );

  useEffect(() => {
    if (!authChecked) {
      return;
    }
    void loadDashboard({ includeShipments: false });
  }, [authChecked, loadDashboard]);

  useEffect(() => {
    if (!authChecked || (!demoSessionEnabled && !isAuthenticated) || shipmentsHydrated) {
      return undefined;
    }

    const schedule = window.requestIdleCallback
      ? window.requestIdleCallback(() => {
          void loadShipmentList({ silent: true });
        }, { timeout: 1200 })
      : window.setTimeout(() => {
          void loadShipmentList({ silent: true });
        }, 250);

    return () => {
      if (window.cancelIdleCallback && typeof schedule === "number" && "requestIdleCallback" in window) {
        window.cancelIdleCallback(schedule);
        return;
      }
      window.clearTimeout(schedule);
    };
  }, [authChecked, demoSessionEnabled, isAuthenticated, loadShipmentList, shipmentsHydrated]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }

    const timer = window.setInterval(async () => {
      try {
        await loadDashboard({ silent: true, includeSources: false });
        if (shipmentsHydrated && (recordsView || auditRow)) {
          void loadShipmentList({ silent: true, force: true });
        }
      } catch {
        // Keep visible state if auto-refresh fails.
      }
    }, 300000);

    return () => window.clearInterval(timer);
  }, [auditRow, autoRefresh, loadDashboard, loadShipmentList, recordsView, shipmentsHydrated]);

  useEffect(() => {
    const query = cleanText(manualForm.customer_name);

    if (!query) {
      setCustomerSuggestions([]);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      try {
        const data = await api.getCustomerSuggestions(query);
        setCustomerSuggestions(Array.isArray(data?.items) ? data.items : []);
      } catch {
        setCustomerSuggestions([]);
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [manualForm.customer_name]);

  useEffect(() => {
    const locations = Array.from(
      new Set(
        dashboardRows
          .map((row) => cleanText(row.latest_location))
          .filter(Boolean)
      )
    );

    if (locations.length === 0) {
      setLocationDistanceMap({});
      return undefined;
    }

    let active = true;
    const applyVisibleDistances = () => {
      const visibleDistances = {};
      locations.forEach((location) => {
        if (Object.prototype.hasOwnProperty.call(locationDistanceCacheRef.current, location)) {
          visibleDistances[location] = locationDistanceCacheRef.current[location];
        }
      });
      setLocationDistanceMap(visibleDistances);
    };

    const missingLocations = locations.filter(
      (location) => !Object.prototype.hasOwnProperty.call(locationDistanceCacheRef.current, location)
    );

    if (missingLocations.length === 0) {
      applyVisibleDistances();
      return undefined;
    }

    api
      .getLocationDistances(missingLocations)
      .then((data) => {
        if (!active) {
          return;
        }
        locationDistanceCacheRef.current = {
          ...locationDistanceCacheRef.current,
          ...(data?.items || {}),
        };
        applyVisibleDistances();
      })
      .catch(() => {
        if (!active) {
          return;
        }
        applyVisibleDistances();
      });

    return () => {
      active = false;
    };
  }, [dashboardRows]);

  useEffect(() => {
    const handlePosition = () => {
      const wrap = tableWrapRef.current;
      if (!wrap) {
        return;
      }

      const rect = wrap.getBoundingClientRect();
      const shouldStick = rect.top <= 12 && rect.bottom >= 120;

      setStickyHeaderActive(shouldStick);
      setStickyHeaderStyle((current) => ({
        ...current,
        left: rect.left,
        width: rect.width,
      }));
    };

    handlePosition();
    window.addEventListener("scroll", handlePosition, { passive: true });
    window.addEventListener("resize", handlePosition);

    return () => {
      window.removeEventListener("scroll", handlePosition);
      window.removeEventListener("resize", handlePosition);
    };
  }, []);

  useEffect(() => {
    const wrap = tableWrapRef.current;
    if (!wrap) {
      return undefined;
    }

    const handleHorizontalScroll = () => {
      setStickyHeaderStyle((current) => ({
        ...current,
        scrollLeft: wrap.scrollLeft,
      }));
    };

    handleHorizontalScroll();
    wrap.addEventListener("scroll", handleHorizontalScroll, { passive: true });

    return () => {
      wrap.removeEventListener("scroll", handleHorizontalScroll);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (trackingRefreshPollRef.current) {
        window.clearInterval(trackingRefreshPollRef.current);
      }
    };
  }, []);

  const normalizedRows = useMemo(
    () =>
      dashboardRows.map((row) => ({
        ...row,
        movement_category: normalizeMovementCategory(row.movement_category),
        container_numbers: Array.isArray(row.container_numbers) ? row.container_numbers : [],
        container_count:
          Number(row.container_count) ||
          (Array.isArray(row.container_numbers) ? row.container_numbers.length : 0),
        movement_diagnostics: normalizeMovementDiagnostics(row.movement_diagnostics),
      })),
    [dashboardRows]
  );

  const completedHistoryRows = useMemo(
    () => buildGroupedRowsFromShipments(shipments, "completed"),
    [shipments]
  );

  const archivedHistoryRows = useMemo(
    () => buildGroupedRowsFromShipments(shipments, "archived"),
    [shipments]
  );

  const shipmentCounts = useMemo(() => {
    return {
      active: Number(shipmentCountSummary.active || normalizedRows.length),
      completed: Number(shipmentCountSummary.completed || completedHistoryRows.length),
      archived: Number(shipmentCountSummary.archived || archivedHistoryRows.length),
      total:
        Number(shipmentCountSummary.total)
        || (
          Number(shipmentCountSummary.active || normalizedRows.length)
          + Number(shipmentCountSummary.completed || completedHistoryRows.length)
          + Number(shipmentCountSummary.archived || archivedHistoryRows.length)
        ),
    };
  }, [
    archivedHistoryRows.length,
    completedHistoryRows.length,
    normalizedRows.length,
    shipmentCountSummary.active,
    shipmentCountSummary.archived,
    shipmentCountSummary.completed,
    shipmentCountSummary.total,
  ]);

  const relatedCycleRows = useMemo(() => {
    if (!auditRow) {
      return [];
    }

    const currentContainers = new Set(
      (auditRow.container_numbers?.length ? auditRow.container_numbers : [auditRow.primary_container_number])
        .map((value) => cleanText(value).toUpperCase())
        .filter(Boolean)
    );
    if (!currentContainers.size) {
      return [];
    }

    const currentBl = cleanText(auditRow.bl_number).toUpperCase().replace(/\s+/g, "");
    const currentGroupKey = cleanText(auditRow.group_key);

    const candidateShipments = shipments.filter((shipment) => {
      const shipmentContainer = cleanText(shipment.container_number).toUpperCase();
      if (!currentContainers.has(shipmentContainer)) {
        return false;
      }
      const shipmentBl = cleanText(shipment.bl_number).toUpperCase().replace(/\s+/g, "");
      if (currentBl) {
        return shipmentBl && shipmentBl !== currentBl;
      }
      return !rowMatchesShipment(auditRow, shipment);
    });

    return buildGroupedRowsFromShipments(candidateShipments)
      .filter((row) => cleanText(row.group_key) !== currentGroupKey)
      .sort((left, right) =>
        compareDateStrings(
          right.movement_since_date || right.latest_time,
          left.movement_since_date || left.latest_time
        )
      );
  }, [auditRow, shipments]);

  useEffect(() => {
    if ((recordsView || auditRow) && !shipmentListLoading) {
      void loadShipmentList({ silent: true, force: shipmentsHydrated });
    }
  }, [auditRow, loadShipmentList, recordsView, shipmentsHydrated]);

  useEffect(() => {
    if (!auditRow) {
      return;
    }
    const refreshedAuditRow =
      normalizedRows.find((row) => row.group_key === auditRow.group_key) ||
      normalizedRows.find((row) => rowMatchesShipment(auditRow, row));
    if (!refreshedAuditRow) {
      return;
    }
    const currentIdentity = `${auditRow.group_key}|${auditRow.latest_time}|${auditRow.last_refresh_at}|${auditRow.last_refresh_status}|${auditRow.do_date}|${auditRow.document_status}|${auditRow.original_docs_received_date}`;
    const nextIdentity = `${refreshedAuditRow.group_key}|${refreshedAuditRow.latest_time}|${refreshedAuditRow.last_refresh_at}|${refreshedAuditRow.last_refresh_status}|${refreshedAuditRow.do_date}|${refreshedAuditRow.document_status}|${refreshedAuditRow.original_docs_received_date}`;
    if (currentIdentity !== nextIdentity) {
      setAuditRow(refreshedAuditRow);
    }
  }, [auditRow, normalizedRows]);

  useEffect(() => {
    if (shipmentImportPreview && shipmentImportSourceContext?.source_type !== "google_sheets") {
      setActiveIntakePanel("excel");
    }
  }, [shipmentImportPreview, shipmentImportSourceContext]);

  useEffect(() => {
    if (
      googleSheetState.selected_sheet ||
      googleSheetState.available_sheets.length > 0 ||
      cleanText(googleSheetState.source_url)
    ) {
      setActiveIntakePanel((current) => current || "google");
    }
  }, [googleSheetState]);

  const visibleHistoryRows = useMemo(() => {
    const sourceRows = recordsView === "completed" ? completedHistoryRows : archivedHistoryRows;
    return sourceRows.filter((row) => {
      const matchesMovement =
        recordsMovementFilter === "All" || row.movement_category === recordsMovementFilter;
      const matchesSearch = rowMatchesSearch(row, deferredRecordsSearch);
      return matchesMovement && matchesSearch;
    });
  }, [archivedHistoryRows, completedHistoryRows, deferredRecordsSearch, recordsMovementFilter, recordsView]);

  const movementCounts = useMemo(() => {
    return normalizedRows.reduce(
      (accumulator, row) => {
        if (row.shipment_status === "archived") {
          return accumulator;
        }
        accumulator.All += 1;
        accumulator[row.movement_category] = (accumulator[row.movement_category] || 0) + 1;
        return accumulator;
      },
      { All: 0, "Arrived Birgunj": 0, "On Rail": 0, "At Port": 0, "Hi Seas": 0 }
    );
  }, [normalizedRows]);

  const filteredRows = useMemo(() => {
    const visibleRows = normalizedRows.filter((row) => {
      const matchesStatus =
        shipmentStatusFilter === "all"
        || (shipmentStatusFilter === "action_needed" ? Boolean(row.action_required) : row.shipment_status === shipmentStatusFilter);
      const matchesMovement =
        movementFilter === "All" || row.movement_category === movementFilter;
      const matchesSearch = rowMatchesSearch(row, deferredSearch);

      return matchesStatus && matchesMovement && matchesSearch;
    });

    return [...visibleRows].sort((left, right) => {
      const result =
        sortConfig.key === "latest_location"
          ? compareLocationByDistance(left.latest_location, right.latest_location, locationDistanceMap)
          : compareValues(left[sortConfig.key], right[sortConfig.key], sortConfig.key);
      return sortConfig.direction === "asc" ? result : -result;
    });
  }, [deferredSearch, locationDistanceMap, movementFilter, normalizedRows, shipmentStatusFilter, sortConfig]);

  useEffect(() => {
    const currentKeys = new Set(normalizedRows.map((row) => cleanText(row.group_key || row.id)));
    setSelectedGroupKeys((current) => current.filter((key) => currentKeys.has(key)));
  }, [normalizedRows]);

  const selectedRows = useMemo(() => {
    const selectedSet = new Set(selectedGroupKeys);
    return normalizedRows.filter((row) => selectedSet.has(cleanText(row.group_key || row.id)));
  }, [normalizedRows, selectedGroupKeys]);

  const allVisibleSelected = useMemo(() => {
    if (!filteredRows.length) {
      return false;
    }
    const selectedSet = new Set(selectedGroupKeys);
    return filteredRows.every((row) => selectedSet.has(cleanText(row.group_key || row.id)));
  }, [filteredRows, selectedGroupKeys]);

  useEffect(() => {
    if (bulkConfirmAction?.type === "completed" && selectedRows.length === 0) {
      setBulkConfirmAction(null);
    }
  }, [bulkConfirmAction, selectedRows]);

  const handleSort = useCallback((key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  useEffect(() => {
    if (!rowContextMenu) {
      return undefined;
    }

    const closeMenu = () => setRowContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [rowContextMenu]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (rowContextMenu) {
        setRowContextMenu(null);
        return;
      }
      if (quickEditRow) {
        setQuickEditRow(null);
        return;
      }
      if (confirmAction) {
        setConfirmAction(null);
        return;
      }
      if (clearancePrompt) {
        setClearancePrompt(null);
        setClearanceDocNumber("");
        return;
      }
      if (documentRow) {
        setDocumentRow(null);
        setDocumentFiles({ invoice: null, packing_list: null, bl_copy: null });
        return;
      }
      if (editRow) {
        setEditRow(null);
        setEditForm(INITIAL_FORM);
        if (editReturnRow) {
          setAuditRow(editReturnRow);
          setEditReturnRow(null);
        }
        return;
      }
      if (actionRow) {
        setActionRow(null);
        if (actionReturnRow) {
          setAuditRow(actionReturnRow);
          setActionReturnRow(null);
        }
        return;
      }
      if (auditRow) {
        setAuditRow(null);
        return;
      }
      if (shipmentImportReviewOpen) {
        setShipmentImportReviewOpen(false);
        return;
      }
      if (sourceBatchDetail) {
        setSourceBatchDetail(null);
        return;
      }
      if (recordsView) {
        setRecordsView(null);
        setRecordsSearch("");
        setRecordsMovementFilter("All");
        return;
      }
      if (ownerDeleteUser) {
        setOwnerDeleteUser(null);
        return;
      }
      if (ownerUserShipments) {
        setOwnerUserShipments(null);
        return;
      }
      if (passwordModalOpen && !currentUser?.password_reset_required) {
        setPasswordModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [
    actionRow,
    actionReturnRow,
    auditRow,
    clearancePrompt,
    confirmAction,
    currentUser,
    documentRow,
    editRow,
    editReturnRow,
    ownerDeleteUser,
    ownerUserShipments,
    passwordModalOpen,
    quickEditRow,
    recordsView,
    rowContextMenu,
    shipmentImportReviewOpen,
    sourceBatchDetail,
  ]);

  useEffect(() => {
    return () => {
      if (rowHighlightTimeoutRef.current) {
        window.clearTimeout(rowHighlightTimeoutRef.current);
      }
    };
  }, []);

  const toggleGroupSelection = useCallback((row) => {
    const key = cleanText(row.group_key || row.id);
    setSelectedGroupKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    const visibleKeys = filteredRows.map((row) => cleanText(row.group_key || row.id));
    setSelectedGroupKeys((current) => {
      const currentSet = new Set(current);
      const allSelected = visibleKeys.every((key) => currentSet.has(key));
      if (allSelected) {
        return current.filter((key) => !visibleKeys.includes(key));
      }
      const next = new Set(current);
      visibleKeys.forEach((key) => next.add(key));
      return Array.from(next);
    });
  }, [filteredRows]);

  const clearSelection = useCallback(() => {
    setSelectedGroupKeys([]);
    setBulkConfirmAction(null);
    setBulkClearanceMap({});
  }, []);

  const triggerRowHighlight = useCallback((groupKey) => {
    if (!cleanText(groupKey)) {
      return;
    }
    if (rowHighlightTimeoutRef.current) {
      window.clearTimeout(rowHighlightTimeoutRef.current);
    }
    setHighlightedGroupKey(groupKey);
    rowHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedGroupKey("");
      rowHighlightTimeoutRef.current = null;
    }, 1200);
  }, []);

  const handleFieldChange = useCallback((field, value) => {
    setManualForm((current) => ({
      ...current,
      [field]: field === "bl_number" ? value.toUpperCase() : value,
    }));
  }, []);

  const handleAddShipment = useCallback(
    async (event) => {
      event.preventDefault();
      setFeedback(null);

      const containerNumbers = parseContainerInput(manualForm.container_input);
      const invalidContainers = containerNumbers.filter((container) => !isValidContainerNumber(container));
      if (containerNumbers.length === 0) {
        setFeedback({ tone: "error", text: "Add at least one container number before saving." });
        return;
      }
      if (invalidContainers.length > 0) {
        setFeedback({
          tone: "error",
          text: `Invalid container format: ${invalidContainers.join(", ")}. Use 4 letters followed by 7 digits.`,
        });
        return;
      }

      try {
        const data = await api.addShipment({
          customer_name: manualForm.customer_name.trim(),
          bl_number: manualForm.bl_number.trim().toUpperCase(),
          container_numbers: containerNumbers,
        });

        setManualForm(INITIAL_FORM);
        setFeedback({
          tone: "success",
          text: `${data.created_count ?? containerNumbers.length} shipment row(s) added successfully.`,
        });
        await refreshDashboardLight();
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Failed to add shipment" });
      }
    },
    [manualForm, refreshDashboardLight]
  );

  const openEditShipment = useCallback((row) => {
    setEditRow(row);
    setEditForm({
      customer_name: row.customer_name || "",
      container_input: (row.container_numbers || [row.primary_container_number]).filter(Boolean).join("\n"),
      bl_number: row.bl_number || "",
      clearance_doc_number: row.clearance_doc_number || "",
      do_date: toInputDateValue(row.do_date),
      document_status: row.document_status || "",
      original_docs_received_date: toInputDateValue(row.original_docs_received_date),
    });
  }, []);

  const closeActionModal = useCallback(() => {
    setActionRow(null);
    if (actionReturnRow) {
      setAuditRow(actionReturnRow);
      setActionReturnRow(null);
    }
  }, [actionReturnRow]);

  const closeEditModal = useCallback(() => {
    setEditRow(null);
    setEditForm(INITIAL_FORM);
    if (editReturnRow) {
      setAuditRow(editReturnRow);
      setEditReturnRow(null);
    }
  }, [editReturnRow]);

  const handleEditFieldChange = useCallback((field, value) => {
    setEditForm((current) => ({
      ...current,
      [field]: field === "bl_number" ? value.toUpperCase() : value,
    }));
  }, []);

  const getOperationalDraft = useCallback(
    (row) =>
      operationalDrafts[row.group_key] || {
        clearance_doc_number: row.clearance_doc_number || "",
        do_date: toInputDateValue(row.do_date),
        document_status: row.document_status || "",
        original_docs_received_date: toInputDateValue(row.original_docs_received_date),
      },
    [operationalDrafts]
  );

  const setOperationalDraftValue = useCallback((row, updates) => {
    setOperationalDrafts((current) => {
      const existing = current[row.group_key] || {
        clearance_doc_number: row.clearance_doc_number || "",
        do_date: toInputDateValue(row.do_date),
        document_status: row.document_status || "",
        original_docs_received_date: toInputDateValue(row.original_docs_received_date),
      };
      return {
        ...current,
        [row.group_key]: {
          ...existing,
          ...updates,
        },
      };
    });
  }, []);

  const handleEditShipment = useCallback(
    async (event) => {
      event.preventDefault();
      if (!editRow) {
        return;
      }
      const containerNumbers = parseContainerInput(editForm.container_input);
      const invalidContainers = containerNumbers.filter((container) => !isValidContainerNumber(container));
      if (containerNumbers.length === 0) {
        setFeedback({ tone: "error", text: "At least one valid container number is required." });
        return;
      }
      if (invalidContainers.length > 0) {
        setFeedback({
          tone: "error",
          text: `Invalid container format: ${invalidContainers.join(", ")}. Use 4 letters followed by 7 digits.`,
        });
        return;
      }

      setEditSubmitting(true);
      setFeedback(null);
      try {
          await api.updateShipmentGroupDetails({
            current_bl_number: editRow.bl_number,
            current_container_numbers: editRow.container_numbers || [editRow.primary_container_number].filter(Boolean),
            customer_name: editForm.customer_name.trim(),
            bl_number: editForm.bl_number.trim().toUpperCase(),
            container_numbers: containerNumbers,
            clearance_doc_number: editForm.clearance_doc_number.trim().toUpperCase(),
            do_date: fromInputDateValue(editForm.do_date),
            document_status: editForm.document_status,
            original_docs_received_date: fromInputDateValue(editForm.original_docs_received_date),
          });
        const updatedAuditRow = editReturnRow
          ? {
              ...editReturnRow,
              customer_name: editForm.customer_name.trim(),
              bl_number: editForm.bl_number.trim().toUpperCase(),
              container_numbers: containerNumbers,
              primary_container_number: containerNumbers[0] || "",
              clearance_doc_number: editForm.clearance_doc_number.trim().toUpperCase(),
              do_date: fromInputDateValue(editForm.do_date),
              document_status: editForm.document_status,
              original_docs_received_date: fromInputDateValue(editForm.original_docs_received_date),
            }
          : null;
        setEditRow(null);
        setEditForm(INITIAL_FORM);
        if (updatedAuditRow) {
          setAuditRow(updatedAuditRow);
          setEditReturnRow(null);
        }
        setFeedback({ tone: "success", text: "Shipment details updated successfully." });
        await refreshDashboardLight();
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Failed to update shipment details" });
      } finally {
        setEditSubmitting(false);
      }
    },
    [editForm, editReturnRow, editRow, refreshDashboardLight]
  );

  const handleOperationalFieldSave = useCallback(
      async (row, updates) => {
        const saveKey = `${row.group_key}:${Object.keys(updates).sort().join("|")}`;
        setFieldSavingKeys((current) => ({ ...current, [saveKey]: true }));
        setFeedback(null);
        try {
          const appliedUpdates = {
            clearance_doc_number: updates.clearance_doc_number ?? row.clearance_doc_number ?? "",
            do_date: updates.do_date ?? row.do_date ?? "",
            document_status: updates.document_status ?? row.document_status ?? "",
            original_docs_received_date:
              updates.original_docs_received_date ?? row.original_docs_received_date ?? "",
          };
          await api.updateShipmentGroupDetails({
            current_bl_number: row.bl_number,
            current_container_numbers: row.container_numbers || [row.primary_container_number].filter(Boolean),
            customer_name: row.customer_name || "",
            bl_number: row.bl_number || "",
            container_numbers: row.container_numbers || [row.primary_container_number].filter(Boolean),
            ...appliedUpdates,
          });
          setDashboardRows((current) =>
            current.map((item) =>
              item.group_key === row.group_key ? applyOperationalFieldUpdate(item, appliedUpdates) : item
            )
          );
          setShipments((current) =>
            current.map((shipment) =>
              rowMatchesShipment(row, shipment) ? applyOperationalFieldUpdate(shipment, appliedUpdates) : shipment
            )
          );
          setAuditRow((current) =>
            current?.group_key === row.group_key ? applyOperationalFieldUpdate(current, appliedUpdates) : current
          );
          setActionRow((current) =>
            current?.group_key === row.group_key ? applyOperationalFieldUpdate(current, appliedUpdates) : current
          );
          setQuickEditRow((current) =>
            current?.group_key === row.group_key ? applyOperationalFieldUpdate(current, appliedUpdates) : current
          );
          triggerRowHighlight(row.group_key);
          setFeedback({ tone: "success", text: "Saved." });
          void refreshDashboardLight();
          return true;
        } catch (error) {
          setFeedback({ tone: "error", text: error.message || "Could not save the shipment fields." });
          return false;
        } finally {
          setFieldSavingKeys((current) => {
            const next = { ...current };
            delete next[saveKey];
            return next;
        });
      }
      },
      [refreshDashboardLight, triggerRowHighlight]
    );

  const saveDoDateDraft = useCallback(
    async (row) => {
      const draft = getOperationalDraft(row);
      const saved = await handleOperationalFieldSave(row, {
        do_date: fromInputDateValue(draft.do_date),
      });
      if (saved) {
        setOperationalDraftValue(row, { do_date: draft.do_date });
      }
    },
    [getOperationalDraft, handleOperationalFieldSave, setOperationalDraftValue]
  );

  const saveDocumentDraft = useCallback(
    async (row) => {
      const draft = getOperationalDraft(row);
      if (draft.document_status === "Original" && !cleanText(draft.original_docs_received_date)) {
        setFeedback({
          tone: "error",
          text: `Choose the received date before saving Original documents for ${row.customer_name || row.bl_number || "this shipment"}.`,
        });
        return;
      }
      const saved = await handleOperationalFieldSave(row, {
        document_status: draft.document_status,
        original_docs_received_date:
          draft.document_status === "Original" ? fromInputDateValue(draft.original_docs_received_date) : "",
      });
      if (saved) {
        setOperationalDraftValue(row, {
          document_status: draft.document_status,
          original_docs_received_date:
            draft.document_status === "Original" ? draft.original_docs_received_date : "",
        });
      }
    },
    [getOperationalDraft, handleOperationalFieldSave, setOperationalDraftValue]
  );

  const saveQuickEditDraft = useCallback(
    async (row) => {
      const draft = getOperationalDraft(row);
      if (draft.document_status === "Original" && !cleanText(draft.original_docs_received_date)) {
        setFeedback({
          tone: "error",
          text: `Choose the received date before saving Original documents for ${row.customer_name || row.bl_number || "this shipment"}.`,
        });
        return false;
      }
      const saved = await handleOperationalFieldSave(row, {
        do_date: fromInputDateValue(draft.do_date),
        document_status: draft.document_status,
        original_docs_received_date:
          draft.document_status === "Original" ? fromInputDateValue(draft.original_docs_received_date) : "",
      });
      if (saved) {
        setQuickEditRow(null);
      }
      return saved;
    },
    [getOperationalDraft, handleOperationalFieldSave]
  );

  const handleShipmentImportPreview = useCallback(async () => {
    if (!shipmentImportFile) {
      setFeedback({ tone: "error", text: "Select an Excel file before detecting columns." });
      return;
    }

    const fileName = cleanText(shipmentImportFile.name).toLowerCase();
    if (!(fileName.endsWith(".xlsx") || fileName.endsWith(".xlsm"))) {
      setFeedback({ tone: "error", text: "Only .xlsx and .xlsm workbooks are supported for import." });
      return;
    }

    if (shipmentImportFile.size > IMPORT_FILE_SIZE_LIMIT_MB * 1024 * 1024) {
      setFeedback({
        tone: "error",
        text: `This workbook is larger than ${IMPORT_FILE_SIZE_LIMIT_MB} MB. Please split or reduce the file before importing.`,
      });
      return;
    }

    setFeedback(null);
    setShipmentImportPreview(null);
    setShipmentImportReviewRows([]);
    setShipmentImportReviewSummary(null);
    setShipmentImportReviewOpen(false);
    setShipmentImportSourceContext(null);

    try {
      const preview = await api.previewShipmentImport(shipmentImportFile);
      setShipmentImportPreview(preview);
      setShipmentImportSourceContext(null);
      const guessedMapping = guessColumns(preview.available_columns);
      const rememberedMapping = preview?.remembered_mapping || {};
      setShipmentImportMapping({
        customer_name: rememberedMapping.customer_name || guessedMapping.customer_name || "",
        container_number: rememberedMapping.container_number || guessedMapping.container_number || "",
        bl_number: rememberedMapping.bl_number || guessedMapping.bl_number || "",
      });
      setFeedback({ tone: "success", text: "Columns detected. Review the mapping and continue." });
    } catch (error) {
      const isFetchFailure = String(error?.message || "").toLowerCase().includes("fetch");
      setFeedback({
        tone: "error",
        text: isFetchFailure
          ? `Unable to reach the import service. Make sure the workbook is .xlsx/.xlsm and under ${IMPORT_FILE_SIZE_LIMIT_MB} MB, then try again.`
          : error.message || "Shipment preview failed",
      });
    }
  }, [shipmentImportFile]);

  const validateShipmentImportRows = useCallback(
    async (rowOverrides = shipmentImportReviewRows) => {
      if (!shipmentImportPreview) {
        throw new Error("Detect the columns before validating the import.");
      }

      return api.validateShipmentImport({
        temp_file_token: shipmentImportPreview.temp_file_token,
        mapping_json: shipmentImportMapping,
        row_overrides: rowOverrides,
      });
    },
    [shipmentImportMapping, shipmentImportPreview, shipmentImportReviewRows]
  );

  const handleImportReviewFieldChange = useCallback((sourceRowNumber, field, value) => {
    setShipmentImportReviewRows((current) =>
      current.map((row) =>
        row.source_row_number === sourceRowNumber
          ? {
              ...row,
              [field]: field === "container_number" ? value.toUpperCase() : value,
            }
          : row
      )
    );
  }, []);

  const resetShipmentImportState = useCallback(() => {
    setShipmentImportFile(null);
    setShipmentImportPreview(null);
    setShipmentImportMapping(INITIAL_MAPPING);
    setShipmentImportReviewRows([]);
    setShipmentImportReviewSummary(null);
    setShipmentImportReviewOpen(false);
    setShipmentImportSourceContext(null);
  }, []);

  const handleShipmentImportConfirm = useCallback(async () => {
    if (!shipmentImportPreview) {
      setFeedback({ tone: "error", text: "Detect the columns before starting the import." });
      return;
    }

    if (!shipmentImportMapping.container_number) {
      setFeedback({ tone: "error", text: "Container Number mapping is required." });
      return;
    }

    setShipmentImporting(true);
    setFeedback(null);

    try {
      const review = await validateShipmentImportRows();
      if ((review.invalid_count || 0) > 0) {
        setShipmentImportReviewRows(review.invalid_rows || []);
        setShipmentImportReviewSummary(review);
        setShipmentImportReviewOpen(true);
        setFeedback({
          tone: "warning",
          text: `Action required: ${review.invalid_count} shipment row(s) need correction before import.`,
        });
        return;
      }

      const data = await api.confirmShipmentImport({
        temp_file_token: shipmentImportPreview.temp_file_token,
        mapping_json: shipmentImportMapping,
        row_overrides: shipmentImportReviewRows,
        source_context: shipmentImportSourceContext,
      });

      resetShipmentImportState();
      setFeedback({
        tone: "success",
        text: formatImportCompletionText(data),
      });
      await loadDashboard({ silent: true });
    } catch (error) {
      setFeedback({ tone: "error", text: error.message || "Shipment import failed" });
    } finally {
      setShipmentImporting(false);
    }
    }, [loadDashboard, resetShipmentImportState, shipmentImportMapping, shipmentImportPreview, shipmentImportReviewRows, shipmentImportSourceContext, validateShipmentImportRows]);

  const handleImportReviewRecheck = useCallback(async () => {
    setShipmentImporting(true);
    setFeedback(null);
    try {
      const review = await validateShipmentImportRows(shipmentImportReviewRows);
      setShipmentImportReviewSummary(review);
      if ((review.invalid_count || 0) > 0) {
        setShipmentImportReviewRows(review.invalid_rows || []);
        setFeedback({
          tone: "warning",
          text: `${review.invalid_count} shipment row(s) still need correction.`,
        });
        return;
      }

      const data = await api.confirmShipmentImport({
        temp_file_token: shipmentImportPreview.temp_file_token,
        mapping_json: shipmentImportMapping,
        row_overrides: shipmentImportReviewRows,
        source_context: shipmentImportSourceContext,
      });

      resetShipmentImportState();
      setFeedback({
        tone: "success",
        text: formatImportCompletionText(data),
      });
      await loadDashboard({ silent: true });
    } catch (error) {
      setFeedback({ tone: "error", text: error.message || "Import review failed" });
    } finally {
      setShipmentImporting(false);
    }
  }, [
    loadDashboard,
      resetShipmentImportState,
      shipmentImportMapping,
      shipmentImportPreview,
      shipmentImportReviewRows,
      shipmentImportSourceContext,
      validateShipmentImportRows,
    ]);

  const handleRefreshAllTracking = useCallback(async () => {
    setFeedback(null);
    setRefreshing(true);
    setTrackingRefreshActive(true);
    setTrackingRefreshProgress(0);

    if (trackingRefreshPollRef.current) {
      window.clearInterval(trackingRefreshPollRef.current);
      trackingRefreshPollRef.current = null;
    }

    try {
      setFeedback({
        tone: "info",
        text: "Refreshing live tracking.",
      });
      let refreshMessage = "Live tracking updated.";
      try {
        const { task_id: taskId } = await api.startRefreshAllTracking();

        const finalStatus = await new Promise((resolve, reject) => {
          const pollStatus = async () => {
            try {
              const status = await api.getRefreshAllTrackingStatus(taskId);
              const nextProgress = Number.isFinite(Number(status.progress))
                ? Math.max(0, Math.min(100, Number(status.progress)))
                : 0;
              setTrackingRefreshProgress(nextProgress);
              setFeedback({
                tone: status.state === "failed" ? "error" : status.state === "completed" ? "success" : "info",
                text:
                  status.message ||
                  "Refreshing live tracking.",
              });

              if (status.state === "completed") {
                if (trackingRefreshPollRef.current) {
                  window.clearInterval(trackingRefreshPollRef.current);
                  trackingRefreshPollRef.current = null;
                }
                resolve(status);
                return;
              }

              if (status.state === "failed") {
                if (trackingRefreshPollRef.current) {
                  window.clearInterval(trackingRefreshPollRef.current);
                  trackingRefreshPollRef.current = null;
                }
                reject(new Error(status.message || "Refresh all failed"));
              }
            } catch (error) {
              if (trackingRefreshPollRef.current) {
                window.clearInterval(trackingRefreshPollRef.current);
                trackingRefreshPollRef.current = null;
              }
              reject(error);
            }
          };

          trackingRefreshPollRef.current = window.setInterval(pollStatus, 1200);
          void pollStatus();
        });

        refreshMessage = finalStatus?.message || refreshMessage;
      } catch (backgroundError) {
        const directRefresh = await api.refreshAllTracking();
        setTrackingRefreshProgress(100);
        refreshMessage =
          directRefresh?.message
          || backgroundError?.message
          || "Live tracking updated.";
      }

      setFeedback({
        tone: "success",
        text: refreshMessage,
      });
      await loadDashboard({ silent: true, includeSources: false });
      if (shipmentsHydrated || recordsView || auditRow) {
        void loadShipmentList({ silent: true, force: true });
      }
    } catch (error) {
      setFeedback({ tone: "error", text: error.message || "Refresh all failed" });
    } finally {
      if (trackingRefreshPollRef.current) {
        window.clearInterval(trackingRefreshPollRef.current);
        trackingRefreshPollRef.current = null;
      }
      window.setTimeout(() => {
        setTrackingRefreshActive(false);
        setTrackingRefreshProgress(0);
      }, 350);
      setRefreshing(false);
    }
  }, [auditRow, loadDashboard, loadShipmentList, recordsView, shipmentsHydrated]);

  const openSourceBatchDetail = useCallback(async (batchId) => {
    try {
      const detail = await api.getShipmentSourceBatch(batchId);
      setSourceBatchDetail(detail);
    } catch (error) {
      setFeedback({ tone: "error", text: error.message || "Failed to load source batch details" });
    }
  }, []);

  const handleGoogleSheetUrlChange = useCallback((value) => {
    setGoogleSheetState((current) => ({
      ...current,
      source_url: value,
      available_sheets: current.source_url === value ? current.available_sheets : [],
      selected_sheet: current.source_url === value ? current.selected_sheet : "",
      sheet_title: current.source_url === value ? current.sheet_title : "",
      source_context: current.source_url === value ? current.source_context : null,
      temp_file_token: current.source_url === value ? current.temp_file_token : "",
    }));
  }, []);

  const handleGoogleSheetFetch = useCallback(async () => {
    const sourceUrl = cleanText(googleSheetState.source_url);
    if (!sourceUrl) {
      setFeedback({ tone: "error", text: "Paste the Google Sheets URL first." });
      return;
    }
    setGoogleSheetLoading(true);
    setFeedback(null);
    try {
      const preview = await api.previewGoogleSheetSource({ source_url: sourceUrl });
      setGoogleSheetState({
        source_url: sourceUrl,
        available_sheets: preview.available_sheets || [],
        selected_sheet: preview.sheet_name || "",
        sheet_title: preview.sheet_title || "Google Sheet",
        source_context: preview.source_context || null,
        temp_file_token: preview.temp_file_token || "",
      });
      setFeedback(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error.message || "Google Sheets could not be reached right now.",
      });
    } finally {
      setGoogleSheetLoading(false);
    }
  }, [googleSheetState.source_url]);

  const handleGoogleSheetSelectPreview = useCallback(async () => {
    const sourceUrl = cleanText(googleSheetState.source_url);
    const selectedSheet = cleanText(googleSheetState.selected_sheet);
    if (!sourceUrl || !selectedSheet) {
      setFeedback({ tone: "error", text: "Choose a sheet tab before continuing." });
      return;
    }
    setGoogleSheetLoading(true);
    setFeedback(null);
    setShipmentImportPreview(null);
    setShipmentImportReviewRows([]);
    setShipmentImportReviewSummary(null);
    setShipmentImportReviewOpen(false);
    setShipmentImportFile(null);
    try {
      const preview = await api.previewGoogleSheetSource({
        source_url: sourceUrl,
        worksheet_name: selectedSheet,
      });
      const guessedMapping = guessColumns(preview.available_columns);
      const rememberedMapping = preview?.remembered_mapping || {};
      setShipmentImportPreview(preview);
      setShipmentImportSourceContext(preview.source_context || null);
      setShipmentImportMapping({
        customer_name: rememberedMapping.customer_name || guessedMapping.customer_name || "",
        container_number: rememberedMapping.container_number || guessedMapping.container_number || "",
        bl_number: rememberedMapping.bl_number || guessedMapping.bl_number || "",
      });
      setGoogleSheetState((current) => ({
        ...current,
        available_sheets: preview.available_sheets || current.available_sheets,
        selected_sheet: preview.sheet_name || selectedSheet,
        sheet_title: preview.sheet_title || current.sheet_title,
        source_context: preview.source_context || current.source_context,
        temp_file_token: preview.temp_file_token || current.temp_file_token,
      }));
      setFeedback(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error.message || "Google Sheet preview could not be prepared.",
      });
    } finally {
      setGoogleSheetLoading(false);
    }
  }, [googleSheetState.selected_sheet, googleSheetState.source_url]);

  const handleRefreshGroup = useCallback(
    async (row) => {
      setFeedback(null);
      setRefreshing(true);

      try {
        setFeedback({
          tone: "info",
          text: "Refreshing this shipment.",
        });
        const data = await api.refreshGroupTracking({
          bl_number: row.bl_number,
          container_numbers: row.container_numbers,
        });
        setFeedback({
          tone: "success",
          text: `Live tracking updated for ${data.refreshed_count ?? 1} shipment${(data.refreshed_count ?? 1) === 1 ? "" : "s"}.`,
        });
        await refreshDashboardLight();
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Refresh failed" });
      } finally {
        setRefreshing(false);
      }
    },
    [refreshDashboardLight]
  );

  const handleDocumentUpload = useCallback(
    async (blNumber, documentType, file) => {
      const stateKey = `${blNumber}:${documentType}`;
      setDocumentUploadState((current) => ({ ...current, [stateKey]: documentType }));
      setFeedback(null);

      try {
        await api.uploadBLDocument(blNumber, documentType, file);
        setFeedback({ tone: "success", text: `${documentType.replace("_", " ")} uploaded for ${blNumber}.` });
        void refreshDashboardLight();
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Document upload failed" });
      } finally {
        setDocumentUploadState((current) => {
          const next = { ...current };
          delete next[stateKey];
          return next;
        });
      }
    },
    [refreshDashboardLight]
  );

  const handleGroupStatusChange = useCallback(
    async (row, shipmentStatus, extra = {}) => {
      setFeedback(null);
      try {
        const data = await api.updateShipmentGroupStatus({
          bl_number: row.bl_number,
          container_numbers: row.container_numbers,
          shipment_status: shipmentStatus,
          ...extra,
        });
        setActionRow((current) => applyShipmentOverlayUpdate(current, row, shipmentStatus, extra));
        setAuditRow((current) => applyShipmentOverlayUpdate(current, row, shipmentStatus, extra));
        setDashboardRows((current) =>
            current.map((item) =>
              item.group_key === row.group_key
                ? {
                    ...item,
                    shipment_status: shipmentStatus,
                    clearance_doc_number: extra.clearance_doc_number || item.clearance_doc_number || "",
                  }
                : item
            )
          );
          if (shipmentStatus === "archived") {
            setDashboardRows((current) => current.filter((item) => item.group_key !== row.group_key));
          }
        setShipments((current) =>
            current
              .map((shipment) =>
                rowMatchesShipment(row, shipment)
                  ? {
                      ...shipment,
                      shipment_status: shipmentStatus,
                      clearance_doc_number: extra.clearance_doc_number || shipment.clearance_doc_number || "",
                    }
                  : shipment
              )
          );
          setFeedback({
            tone: "success",
            text:
              shipmentStatus === "active"
                ? cleanText(row?.shipment_status).toLowerCase() === "archived"
                  ? `${data.count ?? 0} shipment record(s) returned to the live dashboard.`
                  : `${data.count ?? 0} shipment record(s) reopened.`
                : shipmentStatus === "completed"
                  ? `${data.count ?? 0} shipment record(s) marked complete.`
                  : `${data.count ?? 0} shipment record(s) moved to archive.`,
          });
        void refreshDashboardLight();
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Status update failed" });
      }
    },
    [refreshDashboardLight]
  );

  const handleGroupDelete = useCallback(
    async (row) => {
      setFeedback(null);
      try {
        const data = await api.deleteShipmentGroup({
          bl_number: row.bl_number,
          container_numbers: row.container_numbers,
        });
        setActionRow((current) => (current?.group_key === row.group_key ? null : current));
        setAuditRow((current) => (current?.group_key === row.group_key ? null : current));
        setDashboardRows((current) => current.filter((item) => item.group_key !== row.group_key));
        setShipments((current) => current.filter((shipment) => !rowMatchesShipment(row, shipment)));
        setFeedback({
          tone: "success",
          text: `${data.count ?? 0} shipment record(s) removed.`,
        });
        await refreshDashboardLight();
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Delete failed" });
      }
    },
    [refreshDashboardLight]
  );

  const handleDashboardExport = useCallback(async () => {
    setFeedback(null);
    try {
      const { blob } = await api.downloadShipmentDashboardReport();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "tracking-dashboard.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setFeedback({ tone: "error", text: error.message || "Could not download the dashboard report." });
    }
  }, []);

  const handleBulkStatusChange = useCallback(
    async (shipmentStatus, clearanceDocNumbers = {}) => {
      if (!selectedRows.length) {
        return;
      }
      setFeedback(null);
      try {
        const data = await api.updateBulkShipmentGroupStatus({
          shipment_status: shipmentStatus,
          groups: selectedRows.map((row) => ({
            group_key: row.group_key,
            bl_number: row.bl_number,
            container_numbers: row.container_numbers,
          })),
          clearance_doc_numbers: clearanceDocNumbers,
        });
        clearSelection();
        setFeedback({
          tone: "success",
          text: `${data.group_count ?? selectedRows.length} shipment group${(data.group_count ?? selectedRows.length) === 1 ? "" : "s"} updated.`,
        });
        void refreshDashboardLight();
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Bulk update failed" });
      }
    },
    [clearSelection, refreshDashboardLight, selectedRows]
  );

  const handleBulkDelete = useCallback(async () => {
    if (!selectedRows.length) {
      return;
    }
    setFeedback(null);
    try {
      const data = await api.deleteBulkShipmentGroups({
        groups: selectedRows.map((row) => ({
          group_key: row.group_key,
          bl_number: row.bl_number,
          container_numbers: row.container_numbers,
        })),
      });
      clearSelection();
      setFeedback({
        tone: "success",
        text: `${data.group_count ?? selectedRows.length} shipment group${(data.group_count ?? selectedRows.length) === 1 ? "" : "s"} removed.`,
      });
      await refreshDashboardLight();
    } catch (error) {
      setFeedback({ tone: "error", text: error.message || "Bulk delete failed" });
    }
  }, [clearSelection, refreshDashboardLight, selectedRows]);

  const handleDocumentSubmit = useCallback(async () => {
    if (!documentRow?.bl_number) {
      setFeedback({ tone: "error", text: "BL number is required for document upload." });
      return;
    }

    const requiredTypes = DOCUMENT_FIELDS.map(([key]) => key);
    const existingDocuments = documentRow.documents || {};
    const selectedTypes = requiredTypes.filter((type) => documentFiles[type]);
    const missing = requiredTypes.filter((type) => !documentFiles[type] && !existingDocuments[type]);
    if (missing.length > 0) {
      setFeedback({ tone: "error", text: "Please upload all missing documents before saving." });
      return;
    }

    if (selectedTypes.length === 0) {
      setDocumentRow(null);
      setDocumentFiles({ invoice: null, packing_list: null, bl_copy: null });
      return;
    }

    try {
      for (const type of selectedTypes) {
        await handleDocumentUpload(documentRow.bl_number, type, documentFiles[type]);
      }
      setDocumentFiles({ invoice: null, packing_list: null, bl_copy: null });
      setDocumentRow(null);
    } catch {
      // feedback already handled in uploader
    }
  }, [documentFiles, documentRow, handleDocumentUpload]);

  const handleAuthFieldChange = useCallback((field, value) => {
    setAuthForm((current) => ({ ...current, [field]: value }));
  }, []);

  const handleAuthSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setFeedback(null);
      if (authMode === "register" && authForm.password !== authForm.confirmPassword) {
        setFeedback({ tone: "error", text: "Password and confirm password must match." });
        return;
      }

      setAuthSubmitting(true);
      try {
        if (authMode === "login") {
          await api.login({ email: authForm.email.trim().toLowerCase(), password: authForm.password });
        } else {
          await api.register({ email: authForm.email.trim().toLowerCase(), password: authForm.password });
        }
        const user = await api.me();
        setCurrentUser(user);
        setIsAuthenticated(true);
        setAuthChecked(true);
        setAuthForm({ email: "", password: "", confirmPassword: "" });
        await refreshDashboardLight();
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Authentication failed" });
      } finally {
        setAuthSubmitting(false);
      }
    },
    [authForm, authMode, refreshDashboardLight]
  );

  const handleLogout = useCallback(() => {
    api.logout();
    setCurrentUser(null);
    setAdminOverview(null);
    setIsAuthenticated(false);
    setShipments([]);
    setShipmentsHydrated(false);
    setShipmentCountSummary({ active: 0, completed: 0, archived: 0, total: 0 });
    setDashboardRows([]);
    setDashboardIdentifiers({
      total_at_icd_birgunj: 0,
      today_arrivals: 0,
      approaching_birgunj: 0,
      railed_out_this_week: 0,
      today_arrival_customers: [],
      approaching_birgunj_customers: [],
      railed_out_this_week_customers: [],
    });
    setFeedback({ tone: "success", text: "Signed out successfully." });
  }, []);

  const handlePasswordFieldChange = useCallback((field, value) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  }, []);

  const refreshAdminOverview = useCallback(async () => {
    if (!currentUser?.is_admin) {
      return;
    }
    const data = await api.getAdminOverview();
    setAdminOverview(data);
  }, [currentUser]);

  const handleChangePassword = useCallback(
    async (event) => {
      event.preventDefault();
      setFeedback(null);
      if (passwordForm.new_password !== passwordForm.confirm_password) {
        setFeedback({ tone: "error", text: "New password and confirm password must match." });
        return;
      }

      setPasswordSubmitting(true);
      try {
        await api.changePassword({
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        });
        const user = await api.me();
        setCurrentUser(user);
        setPasswordForm(INITIAL_PASSWORD_FORM);
        setPasswordModalOpen(false);
        setFeedback({ tone: "success", text: "Password updated successfully." });
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Could not update the password." });
      } finally {
        setPasswordSubmitting(false);
      }
    },
    [passwordForm]
  );

  const handleAdminResetPassword = useCallback(
    async (userId) => {
      const temporaryPassword = cleanText(adminResetState.password);
      if (!temporaryPassword) {
        setFeedback({ tone: "error", text: "Enter a temporary password before resetting a user account." });
        return;
      }

      setAdminResetSubmitting(true);
      setFeedback(null);
      try {
        await api.adminResetUserPassword({ user_id: userId, temporary_password: temporaryPassword });
        setAdminResetState({ userId: 0, password: "" });
        await refreshAdminOverview();
        setFeedback({
          tone: "success",
          text: "Password reset saved. The user will be asked to choose a new private password after signing in.",
        });
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Could not reset that password." });
      } finally {
        setAdminResetSubmitting(false);
      }
    },
    [adminResetState.password, refreshAdminOverview]
  );

  const handleViewOwnerUserShipments = useCallback(async (user) => {
    setOwnerUserShipmentsLoading(true);
    setFeedback(null);
    try {
      const data = await api.getAdminUserShipments(user.id);
      setOwnerUserShipments(data);
    } catch (error) {
      setFeedback({ tone: "error", text: error.message || "Could not open that user view." });
    } finally {
      setOwnerUserShipmentsLoading(false);
    }
  }, []);

  const handleDeleteOwnerUser = useCallback(async () => {
    if (!ownerDeleteUser?.id) {
      return;
    }
    setOwnerDeletingUser(true);
    setFeedback(null);
    try {
      const result = await api.adminDeleteUser(ownerDeleteUser.id);
      setOwnerDeleteUser(null);
      setOwnerUserShipments((current) =>
        current?.user?.id === ownerDeleteUser.id ? null : current
      );
      await refreshAdminOverview();
      setFeedback({
        tone: "success",
        text: `${result.email || "The user"} was removed from the portal.`,
      });
    } catch (error) {
      setFeedback({ tone: "error", text: error.message || "Could not remove that user." });
    } finally {
      setOwnerDeletingUser(false);
    }
  }, [ownerDeleteUser, refreshAdminOverview]);

  const handleOpenDocument = useCallback(async (blNumber, documentType) => {
    try {
      const { blob } = await api.fetchBLDocument(blNumber, documentType);
      const objectUrl = window.URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      setFeedback({ tone: "error", text: error.message || "Failed to open document" });
    }
  }, []);

  const handleDownloadDocument = useCallback(async (blNumber, documentType, fileName) => {
    try {
      const { blob } = await api.fetchBLDocument(blNumber, documentType);
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName || `${blNumber}-${documentType}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      setFeedback({ tone: "error", text: error.message || "Failed to download document" });
    }
  }, []);

  useEffect(() => {
    if (!auditRow) {
      setAuditEntries([]);
      setAuditJournalExpanded(false);
      setAuditRelatedCyclesExpanded(false);
      setAuditControlsExpanded(false);
      return undefined;
    }
    setAuditJournalExpanded(false);
    setAuditRelatedCyclesExpanded(false);
    setAuditControlsExpanded(false);
    let active = true;
    api
      .getGroupAuditTrail({
        bl_number: auditRow.bl_number,
        container_numbers: auditRow.container_numbers || [auditRow.primary_container_number].filter(Boolean),
      })
      .then((data) => {
        if (!active) {
          return;
        }
        setAuditEntries(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setAuditEntries([]);
      });
    return () => {
      active = false;
    };
  }, [auditRow]);

  const handleOpenRowContextMenu = useCallback((row, event) => {
    setRowContextMenu({ row, x: event.clientX, y: event.clientY });
  }, []);

  const handlePrepareBulkComplete = useCallback(() => {
    const nextMap = {};
    selectedRows.forEach((row) => {
      nextMap[row.group_key] = row.clearance_doc_number || "";
    });
    setBulkClearanceMap(nextMap);
    setBulkConfirmAction({ type: "completed" });
  }, [selectedRows]);

  const handlePrepareBulkArchive = useCallback(() => {
    setBulkConfirmAction({ type: "archived" });
  }, []);

  const handlePrepareBulkDelete = useCallback(() => {
    setBulkConfirmAction({ type: "delete" });
  }, []);

  const landingRenderers = useMemo(
    () => ({
      ActionButton,
      DashboardMetric,
      MovementIdentifier,
      SortableHeader,
      MovementIcon,
      StatCard,
      badgeClass,
      formatLocationLabel,
      formatDocumentStatusSummary,
      formatShipmentStatusLabel,
    }),
    []
  );

  const landingActions = useMemo(
    () => ({
      onWorkspaceChange: handleWorkspaceChange,
      onOpenPassword: () => setPasswordModalOpen(true),
      onLogout: handleLogout,
      onRefreshDashboard: () => loadDashboard({ silent: true }),
      onRefreshTracking: handleRefreshAllTracking,
      onToggleAutoRefresh: (checked) => setAutoRefresh(checked),
      onOpenCompleted: () => setRecordsView("completed"),
      onOpenArchived: () => setRecordsView("archived"),
      onMovementFilterChange: setMovementFilter,
      onShipmentStatusFilterChange: setShipmentStatusFilter,
      onSearchChange: setSearch,
      onExportDashboard: handleDashboardExport,
      onPrepareBulkComplete: handlePrepareBulkComplete,
      onPrepareBulkArchive: handlePrepareBulkArchive,
      onPrepareBulkDelete: handlePrepareBulkDelete,
      onClearSelection: clearSelection,
      onToggleSelectAllVisible: toggleSelectAllVisible,
      onSort: handleSort,
      onOpenAuditRow: setAuditRow,
      onOpenRowContextMenu: handleOpenRowContextMenu,
      onToggleGroupSelection: toggleGroupSelection,
      onOpenDocuments: setDocumentRow,
    }),
    [
      clearSelection,
      handleDashboardExport,
      handleLogout,
      handleOpenRowContextMenu,
      handlePrepareBulkArchive,
      handlePrepareBulkComplete,
      handlePrepareBulkDelete,
      handleRefreshAllTracking,
      handleSort,
      handleWorkspaceChange,
      loadDashboard,
      toggleGroupSelection,
      toggleSelectAllVisible,
    ]
  );

  const portalLandingModel = useMemo(
    () =>
      buildPortalLandingModel({
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
        stickyHeaderActive,
        stickyHeaderStyle,
        highlightedGroupKey,
        allVisibleSelected,
        sortConfig,
        movementFilters: MOVEMENT_FILTERS,
        shipmentStatusFilters: SHIPMENT_STATUS_FILTERS,
        tableWrapRef,
        actions: landingActions,
      }),
    [
      allVisibleSelected,
      autoRefresh,
      currentUser,
      dashboardIdentifiers,
      demoSessionEnabled,
      filteredRows,
      highlightedGroupKey,
      landingActions,
      loading,
      movementCounts,
      movementFilter,
      refreshing,
      search,
      selectedGroupKeys,
      selectedRows,
      shipmentCounts,
      shipmentStatusFilter,
      sortConfig,
      stickyHeaderActive,
      stickyHeaderStyle,
      tableWrapRef,
    ]
  );

  const ownerPanel = currentUser?.is_admin ? (
    <section className="surface owner-panel">
      <div className="panel-heading compact-heading owner-panel-heading">
        <div>
          <p className="eyebrow">Owner View</p>
          <h2>Portal oversight</h2>
          <p className="panel-copy">A quiet view of users, shipment volume, and recent portal activity.</p>
        </div>
        <ActionButton type="button" tone="secondary" onClick={refreshAdminOverview} disabled={adminLoading}>
          {adminLoading ? "Refreshing..." : "Refresh owner view"}
        </ActionButton>
      </div>

      <div className="owner-metric-grid">
        <DashboardMetric label="Users" value={adminOverview?.metrics?.total_users || 0} />
        <DashboardMetric label="Live Shipments" value={adminOverview?.metrics?.live_shipments || 0} />
        <DashboardMetric label="Completed" value={adminOverview?.metrics?.completed_shipments || 0} />
        <DashboardMetric label="Archived" value={adminOverview?.metrics?.archived_shipments || 0} />
      </div>

      <div className="owner-grid">
        <section className="owner-card">
          <div className="owner-card-head">
            <h3>People in the portal</h3>
            <p>See who has signed up and reset access when someone needs help getting back in.</p>
          </div>
          <div className="owner-user-list">
            {(adminOverview?.users || []).length === 0 ? (
              <div className="empty-state-panel">No users yet.</div>
            ) : (
              (adminOverview?.users || []).map((user) => (
                <article key={user.id} className="owner-user-row">
                  <div className="owner-user-copy">
                    <strong>{user.email}</strong>
                    <span>
                      Joined {user.created_at ? formatDateTimeLabel(user.created_at) : "date not recorded"}
                    </span>
                    <span>
                      Last active{" "}
                      {user.last_activity_at ? formatDateTimeLabel(user.last_activity_at) : "no activity yet"}
                    </span>
                    <span>
                      Last sign in{" "}
                      {user.last_login_at ? formatDateTimeLabel(user.last_login_at) : "not recorded yet"}
                    </span>
                    <span>
                      {user.shipment_count || 0} shipments, {user.source_batch_count || 0} imports
                      {user.password_reset_required ? " | password needs to be changed" : ""}
                    </span>
                  </div>
                  {!user.is_admin ? (
                    <div className="owner-user-actions">
                      <div className="owner-user-quick-actions">
                        <ActionButton
                          type="button"
                          tone="secondary"
                          compact
                          disabled={ownerUserShipmentsLoading}
                          onClick={() => handleViewOwnerUserShipments(user)}
                        >
                          {ownerUserShipmentsLoading && ownerUserShipments?.user?.id === user.id
                            ? "Opening..."
                            : "View shipments"}
                        </ActionButton>
                        <ActionButton
                          type="button"
                          tone="danger"
                          compact
                          onClick={() => setOwnerDeleteUser(user)}
                        >
                          Remove user
                        </ActionButton>
                      </div>
                      <div className="owner-password-reset">
                        <input
                          type="password"
                          placeholder="Temporary password"
                          value={adminResetState.userId === user.id ? adminResetState.password : ""}
                          onChange={(event) =>
                            setAdminResetState({ userId: user.id, password: event.target.value })
                          }
                        />
                        <ActionButton
                          type="button"
                          tone="ghost"
                          disabled={adminResetSubmitting}
                          onClick={() => handleAdminResetPassword(user.id)}
                        >
                          Reset password
                        </ActionButton>
                      </div>
                    </div>
                  ) : (
                    <span className="meta-pill">Owner</span>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="owner-card">
          <div className="owner-card-head">
            <h3>Recent activity</h3>
            <p>Recent changes across the portal, shown in plain language.</p>
          </div>
          <div className="owner-activity-list">
            {(adminOverview?.recent_activity || []).length === 0 ? (
              <div className="empty-state-panel">No recent activity yet.</div>
            ) : (
              (adminOverview?.recent_activity || []).map((entry) => (
                <article key={entry.id} className="owner-activity-row">
                  <strong>{formatAuditActionLabel(entry.action)}</strong>
                  <span>{entry.email || "Unknown user"}</span>
                  <span>{entry.bl_number || entry.container_number || "Portal activity"}</span>
                  <span>{formatDateTimeLabel(entry.created_at)}</span>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  ) : null;

  if (!authChecked) {
    return <main className="app-shell loading-shell">Loading portal...</main>;
  }

  if (!demoSessionEnabled && !isAuthenticated) {
    return (
      <AuthScreen
        mode={authMode}
        form={authForm}
        loading={authSubmitting}
        feedback={feedback}
        onModeChange={() => setAuthMode((current) => (current === "login" ? "register" : "login"))}
        onFieldChange={handleAuthFieldChange}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <main className="app-shell">
      <PortalLandingExperience
        model={portalLandingModel}
        renderers={landingRenderers}
        ownerPanel={ownerPanel}
      />

        {trackingRefreshActive && (
          <section className="surface progress-banner" aria-live="polite">
            <div className="progress-banner-copy">
              <strong>Refreshing live tracking</strong>
              <span>{Math.round(trackingRefreshProgress)}%</span>
            </div>
            <div className="progress-track" aria-hidden="true">
              <span className="progress-fill" style={{ width: `${trackingRefreshProgress}%` }} />
            </div>
          </section>
      )}

      {feedback && (
        <section className={`surface banner banner-${feedback.tone}`} aria-live="polite">
          {feedback.text}
        </section>
      )}

      <section className="surface intake-shell">
        <div className="panel-heading compact-heading intake-heading">
          <div>
            <p className="eyebrow">Intake</p>
            <h2>Add or import shipments</h2>
            <p className="panel-copy">Bring shipments in the way that suits you.</p>
          </div>
        </div>

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
            <div className="panel-heading compact-heading">
              <div>
                <p className="eyebrow">Manual</p>
                <h2>Add shipment</h2>
                <p className="panel-copy">Enter the customer, BL, and containers.</p>
              </div>
            </div>

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
            <div className="panel-heading compact-heading">
              <div>
                <p className="eyebrow">Workbook</p>
                <h2>Import from Excel</h2>
                <p className="panel-copy">Upload the sheet, then match the fields.</p>
              </div>
            </div>

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
                    <button
                      type="button"
                      className="quiet-link"
                      onClick={() => openSourceBatchDetail(sourceBatches[0].id)}
                    >
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

                <ActionButton
                  type="button"
                  tone="primary"
                  disabled={shipmentImporting}
                  onClick={handleShipmentImportConfirm}
                >
                  {shipmentImporting ? "Adding..." : "Add shipments"}
                </ActionButton>

                {shipmentImportReviewSummary?.invalid_count ? (
                  <div className="confirm-warning">
                    <strong>Action Required:</strong> {shipmentImportReviewSummary.invalid_count} shipment row(s)
                    need correction before import.
                    <div className="edit-actions-row">
                      <ActionButton
                        type="button"
                        tone="secondary"
                        onClick={() => setShipmentImportReviewOpen(true)}
                      >
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
            ) : null}
          </article>
        ) : null}

        {activeIntakePanel === "google" ? (
          <article className="intake-expanded-panel">
            <div className="panel-heading compact-heading">
              <div>
                <p className="eyebrow">Google</p>
                <h2>Import from Google Sheets</h2>
                <p className="panel-copy">Paste the sheet link, choose the tab, then match the fields.</p>
              </div>
            </div>

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
                <ActionButton
                  type="button"
                  tone="secondary"
                  disabled={googleSheetLoading}
                  onClick={handleGoogleSheetFetch}
                >
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

      {actionRow && (
        <Modal
          title={`Manage Shipment${actionRow.bl_number ? ` - ${actionRow.bl_number}` : ` - ${actionRow.primary_container_number}`}`}
          onClose={closeActionModal}
        >
          {(() => {
            const actionStatus = cleanText(actionRow.shipment_status).toLowerCase();
            const canActivate = ["completed", "archived"].includes(actionStatus);
            const canComplete = !["completed", "archived"].includes(actionStatus);
            const canArchive = actionStatus !== "archived";
            const reopenLabel = actionStatus === "archived" ? "Bring back to live" : "Reopen shipment";
            return (
          <div className="action-modal-shell">
            <section className="action-modal-hero action-modal-hero-balanced">
              <div className="action-modal-copy">
                <p className="action-modal-eyebrow">Manage this shipment cycle</p>
                <h4>{actionRow.customer_name || "Shipment group"}</h4>
                <div className="action-modal-chips">
                  <span className={badgeClass("movement", actionRow.movement_category || "Hi Seas")}>
                    {actionRow.movement_category || "Hi Seas"}
                  </span>
                  {actionRow.action_required ? (
                    <span className="soft-attention-pill" title={actionRow.action_required_reason || "Action required"}>
                      Action needed
                    </span>
                  ) : null}
                  <span className="meta-pill">
                    {actionRow.container_count || actionRow.container_numbers?.length || 1} container
                    {(actionRow.container_count || actionRow.container_numbers?.length || 1) === 1 ? "" : "s"}
                  </span>
                  <span className="meta-pill">
                    {actionRow.bl_number ? `BL ${actionRow.bl_number}` : "BL not linked"}
                  </span>
                </div>
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
                  <ActionButton type="button" tone="secondary" onClick={async () => {
                    await handleRefreshGroup(actionRow);
                    closeActionModal();
                  }}>
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
            );
          })()}
        </Modal>
      )}

      {confirmAction && (
        <Modal title="Confirm Action" onClose={() => setConfirmAction(null)}>
          {confirmAction.type === "archived" && !cleanText(confirmAction.row?.clearance_doc_number) ? (
            <div className="confirm-warning">
              Archive is locked for this BL. Click <strong>Complete</strong> first, save the clearance document number,
              and only then archive this BL group.
            </div>
          ) : null}
          <div className="confirm-copy">
            <p>
              Are you sure you want to{" "}
                <strong>{confirmAction.type === "delete" ? "delete" : `mark as ${confirmAction.type}`}</strong>{" "}
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
                  if (confirmAction.type === "delete") {
                    await handleGroupDelete(confirmAction.row);
                  } else if (confirmAction.type === "completed") {
                    setClearancePrompt(confirmAction.row);
                    setClearanceDocNumber("");
                  } else {
                    await handleGroupStatusChange(confirmAction.row, confirmAction.type);
                    if (confirmAction.type === "delete") {
                      closeActionModal();
                    }
                  }
                  setConfirmAction(null);
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
                          setSelectedGroupKeys((current) =>
                            current.filter((groupKey) => groupKey !== row.group_key),
                          );
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
                Are you sure you want to{" "}
                <strong>{bulkConfirmAction.type === "delete" ? "delete" : `mark as ${bulkConfirmAction.type}`}</strong>{" "}
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
        <Modal title="Clearance Document Number" onClose={() => {
          setClearancePrompt(null);
          setClearanceDocNumber("");
        }}>
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
            <ActionButton type="button" tone="ghost" onClick={() => {
              setClearancePrompt(null);
              setClearanceDocNumber("");
            }}>
              Cancel
            </ActionButton>
            <ActionButton
              type="button"
              tone="primary"
              onClick={async () => {
                await handleGroupStatusChange(clearancePrompt, "completed", {
                  clearance_doc_number: clearanceDocNumber.trim(),
                });
                setClearancePrompt(null);
                setClearanceDocNumber("");
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
        <Modal title={`${documentRow.documents_complete ? "Documents" : "Add Documents"} for ${documentRow.bl_number}`} onClose={() => {
          setDocumentRow(null);
          setDocumentFiles({ invoice: null, packing_list: null, bl_copy: null });
        }}>
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
                          documentRow.documents[key].original_name
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
            <ActionButton type="button" tone="ghost" onClick={() => {
              setDocumentRow(null);
              setDocumentFiles({ invoice: null, packing_list: null, bl_copy: null });
            }}>
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
                  exportRowsAsCsv(
                    `${recordsView}-shipments.csv`,
                    visibleHistoryRows,
                    [
                      { label: "Customer", value: (row) => row.customer_name },
                      { label: "BL", value: (row) => row.bl_number },
                      { label: "Containers", value: (row) => (row.container_numbers || []).join(", ") },
                      { label: "Movement", value: (row) => row.movement_category },
                      { label: "Latest Location", value: (row) => row.latest_location },
                      { label: "Movement Since", value: (row) => row.movement_since_date || row.latest_time },
                      { label: "Clearance Doc", value: (row) => row.clearance_doc_number },
                    ]
                  )
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
                      <td colSpan={recordsView === "archived" ? 8 : 7} className="empty-cell">No shipment groups available.</td>
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

      {auditRow && (
        <Modal
          title={`Shipment Detail${auditRow.bl_number ? ` - ${auditRow.bl_number}` : ` - ${auditRow.primary_container_number}`}`}
          onClose={() => setAuditRow(null)}
          size="wide"
          actions={
            <>
              <ActionButton
                type="button"
                tone="secondary"
                disabled={refreshing}
                onClick={async () => {
                  await handleRefreshGroup(auditRow);
                }}
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </ActionButton>
              <ActionButton
                type="button"
                tone="secondary"
                onClick={() => {
                  setEditReturnRow(auditRow);
                  openEditShipment(auditRow);
                  setAuditRow(null);
                }}
              >
                Edit Details
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
                  {auditRow.action_required ? (
                    <span className="soft-attention-pill" title={auditRow.action_required_reason || "Action required"}>
                      Action needed
                    </span>
                  ) : null}
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
                    <strong>{auditRow.last_refresh_at ? formatDateTimeLabel(auditRow.last_refresh_at) : "No refresh yet"}</strong>
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
                              clearance_doc_number: cleanText(
                                draft.clearance_doc_number ?? auditRow.clearance_doc_number
                              ).toUpperCase(),
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
                    <div className="audit-container-chips">
                      {(auditRow.container_numbers?.length
                        ? auditRow.container_numbers
                        : [auditRow.primary_container_number]
                      )
                        .filter(Boolean)
                        .map((container) => (
                          <span key={container} className="audit-container-chip">
                            {container}
                          </span>
                        ))}
                    </div>
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
                  <ActionButton
                    type="button"
                    tone="ghost"
                    compact
                    onClick={() => setAuditControlsExpanded((current) => !current)}
                  >
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
                          onChange={(event) =>
                            setOperationalDraftValue(auditRow, { do_date: event.target.value })
                          }
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
                            onChange={(event) =>
                              setOperationalDraftValue(auditRow, {
                                original_docs_received_date: event.target.value,
                              })
                            }
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
                        disabled={Boolean(
                          fieldSavingKeys[`${auditRow.group_key}:document_status|original_docs_received_date`]
                        )}
                        onClick={async () => {
                          await saveDocumentDraft(auditRow);
                        }}
                      >
                        {fieldSavingKeys[`${auditRow.group_key}:document_status|original_docs_received_date`]
                          ? "Saving..."
                          : "Save Document Status"}
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
                            <span className="meta-pill">
                              {formatShipmentStatusLabel(row.shipment_status || "active")}
                            </span>
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
                summary={
                  auditEntries.length
                    ? `Latest update: ${formatAuditActionLabel(auditEntries[0]?.action)}`
                    : "No activity has been recorded for this shipment group yet."
                }
                open={auditJournalExpanded}
                onToggle={() => setAuditJournalExpanded((current) => !current)}
              >
                <div className="preview-actions audit-journal-tools">
                  {auditEntries.length ? (
                    <ActionButton
                      type="button"
                      tone="secondary"
                      onClick={() =>
                        exportRowsAsCsv(
                          "shipment-audit.csv",
                          auditEntries,
                          [
                            { label: "Created At", value: (row) => row.created_at },
                            { label: "Action", value: (row) => row.action },
                            { label: "BL", value: (row) => row.bl_number },
                            { label: "Container", value: (row) => row.container_number },
                            { label: "Status", value: (row) => row.shipment_status },
                            { label: "Details", value: (row) => JSON.stringify(row.details || {}) },
                          ]
                        )
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
                        <article
                          key={entry.id}
                          className="audit-timeline-item motion-stagger-item"
                          style={{ "--motion-index": index }}
                        >
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
      )}

      {shipmentImportReviewOpen && (
        <Modal
          title="Action Required - Review Invalid Rows"
          onClose={() => setShipmentImportReviewOpen(false)}
          size="wide"
          actions={
            <ActionButton
              type="button"
              tone="primary"
              disabled={shipmentImporting}
              onClick={handleImportReviewRecheck}
            >
              {shipmentImporting ? "Rechecking..." : "Recheck and Import"}
            </ActionButton>
          }
        >
          <div className="audit-panel">
            <div className="confirm-warning">
              Some shipment rows need correction before they can be added to tracking. The list below shows only
              the rows that still need attention.
            </div>

            <div className="audit-hero">
              <section className="audit-hero-primary import-review-hero">
                <span className="audit-detail-title">Review Summary</span>
                <h4>{shipmentImportReviewSummary?.invalid_count || 0} row(s) need correction</h4>
                <div className="audit-hero-meta">
                  <span className="meta-pill">{shipmentImportReviewSummary?.valid_count || 0} ready to import</span>
                  <span className="meta-pill">
                    {shipmentImportReviewSummary?.skipped_blank_count || 0} blank rows ignored
                  </span>
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

      {shipmentImportPreview && shipmentImportSourceContext?.source_type === "google_sheets" && (
        <Modal
          title="Import from Google Sheets"
          onClose={resetShipmentImportState}
          size="wide"
          actions={
              <ActionButton
                type="button"
                tone="primary"
                disabled={shipmentImporting}
                onClick={handleShipmentImportConfirm}
              >
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
                  <strong>Action Required:</strong> {shipmentImportReviewSummary.invalid_count} shipment row(s)
                  need correction before import.
                  <div className="edit-actions-row">
                    <ActionButton
                      type="button"
                      tone="secondary"
                      onClick={() => setShipmentImportReviewOpen(true)}
                    >
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
        <Modal
          title={`Import Batch #${sourceBatchDetail.id}`}
          onClose={() => setSourceBatchDetail(null)}
          size="wide"
        >
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
        <Modal
          title={ownerUserShipments.user?.email || "User shipments"}
          onClose={() => setOwnerUserShipments(null)}
          size="wide"
        >
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
            <ActionButton
              type="button"
              tone="danger"
              disabled={ownerDeletingUser}
              onClick={handleDeleteOwnerUser}
            >
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
                      onChange={(event) =>
                        handleEditFieldChange("original_docs_received_date", event.target.value)
                      }
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
                <ActionButton type="button" tone="ghost" onClick={() => {
                  setPasswordModalOpen(false);
                  setPasswordForm(INITIAL_PASSWORD_FORM);
                }}>
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
    </main>
  );
}

export default App;

