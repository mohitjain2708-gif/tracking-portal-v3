import { MOVEMENT_PRIORITY } from "../constants/portalConstants";

const DESTUFFING_LABELS = {
  "factory destuffing": "Factory Destuffing",
  "icd destuffing": "ICD Destuffing",
  "warehouse destuffing": "Warehouse Destuffing",
};

export function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDestuffingLabel(value) {
  return DESTUFFING_LABELS[cleanText(value).toLowerCase()] || "";
}

export function getDestuffingTone(value) {
  const normalized = normalizeDestuffingLabel(value);
  if (normalized === "Factory Destuffing") {
    return "factory";
  }
  if (normalized === "ICD Destuffing") {
    return "icd";
  }
  if (normalized === "Warehouse Destuffing") {
    return "warehouse";
  }
  return "";
}

export function buildContainerDetails(row) {
  const details = [];
  const seen = new Map();
  const sourceItems = Array.isArray(row?.container_details) && row.container_details.length
    ? row.container_details
    : (Array.isArray(row?.container_numbers) ? row.container_numbers : [row?.primary_container_number]).map((number) => ({
        number,
        destuffing_label: row?.destuffing_label || row?.pristine_booking_mode || "",
      }));

  sourceItems.forEach((item) => {
    const number = cleanText(item?.number || item?.container_number || item).toUpperCase();
    if (!number) {
      return;
    }
    const nextLabel = normalizeDestuffingLabel(
      item?.destuffing_label || item?.pristine_booking_mode || item?.booking_mode || ""
    );
    const existing = seen.get(number) || { number, destuffing_label: "" };
    if (nextLabel && !existing.destuffing_label) {
      existing.destuffing_label = nextLabel;
    }
    seen.set(number, existing);
  });

  seen.forEach((detail) => {
    details.push(detail);
  });

  return details.sort((left, right) => left.number.localeCompare(right.number, undefined, { sensitivity: "base" }));
}

export function getVisibleContainerDetails(row, expanded = false, maxVisible = 5) {
  const details = buildContainerDetails(row);
  if (expanded || details.length <= maxVisible) {
    return details;
  }
  return details.slice(0, maxVisible);
}

export function getContainerOverflowCount(row, maxVisible = 5) {
  const details = buildContainerDetails(row);
  return Math.max(0, details.length - maxVisible);
}

export function isDestuffingReady(row) {
  const details = buildContainerDetails(row);
  return details.length > 0 && details.every((detail) => normalizeDestuffingLabel(detail.destuffing_label));
}

export function formatActionSummary(row) {
  if (row?.destuffing_ready || isDestuffingReady(row)) {
    return "Destuffing follow-through ready";
  }
  if (cleanText(row?.action_required_summary)) {
    return cleanText(row.action_required_summary);
  }
  if (cleanText(row?.action_required_reason)) {
    return "Follow-up recommended";
  }
  return "";
}

export function parseContainerInput(value) {
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

export function isValidContainerNumber(value) {
  return /^[A-Z]{4}\d{7}$/.test(cleanText(value).toUpperCase());
}

export function toInputDateValue(value) {
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

export function fromInputDateValue(value) {
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

export function hasDoDateDraftChanges(row, draft) {
  return toInputDateValue(row?.do_date) !== cleanText(draft?.do_date);
}

export function hasDocumentDraftChanges(row, draft) {
  const currentStatus = cleanText(row?.document_status);
  const draftStatus = cleanText(draft?.document_status);
  if (currentStatus !== draftStatus) {
    return true;
  }
  return toInputDateValue(row?.original_docs_received_date) !== cleanText(draft?.original_docs_received_date);
}

export function formatDocumentStatusSummary(row) {
  const status = cleanText(row?.document_status);
  if (!status) {
    return "Not set";
  }
  if (status === "Original" && cleanText(row?.original_docs_received_date)) {
    return `Original - ${row.original_docs_received_date}`;
  }
  return status;
}

export function formatShipmentDetailSummary(row) {
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

export function toLocationTitleCase(value) {
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

export function formatLocationLabel(value) {
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

export function normalizeLooseText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIdentifierText(value) {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

export function isLikelyIdentifierQuery(value) {
  const raw = cleanText(value);
  const normalized = normalizeIdentifierText(raw);
  return !/\s/.test(raw) && normalized.length >= 4 && /\d/.test(normalized);
}

export function rowMatchesSearch(row, query) {
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

export function formatShipmentStatusLabel(value) {
  const status = cleanText(value).toLowerCase();
  if (status === "active") {
    return "Live";
  }
  if (!status) {
    return "-";
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatRefreshStatusLabel(value) {
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

export function normalizeMovementDiagnostics(value) {
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

export function formatTrackingSourceLabel(value) {
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

export function applyOperationalFieldUpdate(current, updates = {}) {
  if (!current) {
    return current;
  }
  return {
    ...current,
    bl_surrender_status: updates.bl_surrender_status ?? current.bl_surrender_status ?? "",
    clearance_doc_number: updates.clearance_doc_number ?? current.clearance_doc_number ?? "",
    do_date: updates.do_date ?? current.do_date ?? "",
    document_status: updates.document_status ?? current.document_status ?? "",
    original_docs_received_date:
      updates.original_docs_received_date ?? current.original_docs_received_date ?? "",
  };
}

export function applyShipmentOverlayUpdate(current, referenceRow, shipmentStatus, extra = {}) {
  if (!current || current.group_key !== referenceRow.group_key) {
    return current;
  }
  return {
    ...applyOperationalFieldUpdate(current, extra),
    shipment_status: shipmentStatus,
  };
}

export function formatImportCompletionText(data) {
  const imported = Number(data?.imported_count ?? 0);
  const duplicateCount = Number(data?.duplicate_count ?? 0);
  const skippedBlankCount = Number(data?.skipped_blank_count ?? 0);
  const skippedInvalidCount = Number(data?.skipped_invalid_count ?? 0);
  const skippedTotal = duplicateCount + skippedBlankCount + skippedInvalidCount;

  const summary = imported === 1 ? "1 shipment added." : `${imported} shipments added.`;
  const detail = skippedTotal > 0 ? ` ${skippedTotal} row${skippedTotal === 1 ? "" : "s"} left out.` : "";
  const warning = data?.source_tracking_warning ? ` ${data.source_tracking_warning}` : "";
  return `${summary}${detail}${warning}`.trim();
}

export function formatAuditActionLabel(value) {
  const action = cleanText(value).toLowerCase();
    const custom = {
      shipment_group_refreshed: "Shipment group refreshed",
      shipment_all_refreshed: "All active shipments refreshed",
      shipment_imported: "Shipment import completed",
      shipment_status_updated: "Shipment status updated",
      shipment_bl_status_updated: "BL status updated",
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

export function formatAuditDetails(details) {
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

  if (details.bl_surrender_status !== undefined) {
    const label = formatBlSurrenderStatusLabel(details.bl_surrender_status);
    return label ? `${label} saved for this shipment cycle.` : "BL surrender status cleared.";
  }

  if (typeof details.deleted_count === "number") {
    return `${details.deleted_count} duplicate shipment rows cleaned up.`;
  }

  if (typeof details.imported_count === "number") {
    return `${details.imported_count} imported, ${details.duplicate_count || 0} duplicates skipped, ${details.skipped_blank_count || 0} blank rows ignored, and ${details.skipped_invalid_count || 0} invalid containers skipped.`;
  }

  if (details.document_type || details.original_name) {
    const label = details.document_type ? details.document_type.replace(/_/g, " ") : "document";
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

export function formatDateTimeLabel(value) {
  const text = cleanText(value);
  if (!text) {
    return "-";
  }

  const legacyMatch = text.match(/^((\d{2})-(\d{2})-(\d{4}))(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  const parsed = legacyMatch
    ? new Date(
        Number(legacyMatch[4]),
        Number(legacyMatch[3]) - 1,
        Number(legacyMatch[2]),
        Number(legacyMatch[5] || 0),
        Number(legacyMatch[6] || 0),
        Number(legacyMatch[7] || 0)
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

export function guessColumns(columns) {
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

export function normalizeMovementCategory(value) {
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

export function badgeClass(type, value) {
  const key = String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `badge badge-${type} badge-${type}-${key || "unknown"}`;
}

export function normalizeBlSurrenderStatus(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) {
    return "";
  }
  if (text === "surrendered" || text === "bl surrendered") {
    return "surrendered";
  }
  if (text === "pending" || text === "bl surrender pending" || text === "surrender pending") {
    return "pending";
  }
  return "";
}

export function formatBlSurrenderStatusLabel(value) {
  const normalized = normalizeBlSurrenderStatus(value);
  if (normalized === "surrendered") {
    return "BL Surrendered";
  }
  if (normalized === "pending") {
    return "BL Surrender Pending";
  }
  return "";
}

export function compareDateStrings(left, right) {
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

export function earliestDateString(values) {
  const dates = (Array.isArray(values) ? values : []).filter((value) => cleanText(value));
  if (!dates.length) {
    return "";
  }
  return [...dates].sort((left, right) => compareDateStrings(left, right))[0] || "";
}

export function compareValues(left, right, key) {
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

export function rowMatchesShipment(row, shipment) {
  const shipmentContainer = cleanText(shipment.container_number).toUpperCase();
  const rowBL = cleanText(row.bl_number).toUpperCase();
  const shipmentBL = cleanText(shipment.bl_number).toUpperCase();
  const rowContainers = (row.container_numbers || []).map((value) => cleanText(value).toUpperCase());

  if (rowBL) {
    return shipmentBL === rowBL;
  }

  return rowContainers.includes(shipmentContainer);
}

export function buildGroupedRowsFromShipments(shipments, statusFilter = null) {
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
      const containerDetails = buildContainerDetails({
        container_details: sortedEntries.map((item) => ({
          number: item.container_number,
          destuffing_label: item.destuffing_label || item.pristine_booking_mode,
        })),
      });
      const containerNumbers = containerDetails.map((item) => item.number);
      const destuffingReady = containerDetails.length > 0 && containerDetails.every((item) => item.destuffing_label);
      const legacyActionRequired = sortedEntries.some((item) => item.action_required);
      const actionRequired = legacyActionRequired || destuffingReady;
      const blSurrenderStatus = normalizeBlSurrenderStatus(
        sortedEntries.find((item) => normalizeBlSurrenderStatus(item.bl_surrender_status))?.bl_surrender_status
      );
      return {
        group_key: groupKey,
        id: lead.id,
        customer_name: cleanText(lead.customer_name) || "-",
        primary_container_number: cleanText(lead.container_number),
        container_details: containerDetails,
        container_numbers: containerNumbers,
        container_count: containerNumbers.length,
        bl_number: cleanText(lead.bl_number),
        bl_surrender_status: blSurrenderStatus,
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
        action_required: actionRequired,
        action_required_reason: cleanText(
          sortedEntries.find((item) => cleanText(item.action_required_reason))?.action_required_reason
        ),
        action_required_summary: destuffingReady ? "Destuffing follow-through ready" : (actionRequired ? "Follow-up recommended" : ""),
        destuffing_ready: destuffingReady,
        movement_diagnostics: {
          ...normalizeMovementDiagnostics(lead.movement_diagnostics),
          group_scope_summary: `The dashboard is showing the strongest live movement across ${containerNumbers.length || 1} container${containerNumbers.length === 1 ? "" : "s"} in this BL group.`,
        },
        raw_shipments: sortedEntries,
      };
    })
    .sort((left, right) => compareDateStrings(right.latest_time, left.latest_time));
}

export function compareLocationByDistance(leftLocation, rightLocation, distanceMap) {
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

export function exportRowsAsCsv(fileName, rows, columns) {
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

