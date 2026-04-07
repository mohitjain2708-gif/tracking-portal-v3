import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, isDemoSessionEnabled } from "./api";

const INITIAL_FORM = {
  customer_name: "",
  container_number: "",
  bl_number: "",
};

const INITIAL_MAPPING = {
  customer_name: "",
  container_number: "",
  bl_number: "",
};

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

const STATUS_OPTIONS = ["active", "completed", "archived"];
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
  return String(value || "").trim();
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

function compareValues(left, right, key) {
  if (key === "latest_time" || key === "departure") {
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

function StatCard({ label, value }) {
  return (
    <article className="stat-card">
      <p className="stat-label">{label}</p>
      <strong className="stat-value">{value}</strong>
    </article>
  );
}

function ActionButton({ children, tone = "default", ...props }) {
  return (
    <button className={`button button-${tone}`} {...props}>
      {children}
    </button>
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

function MovementIdentifier({ filter, isActive, count, onClick }) {
  return (
    <button
      type="button"
      className={`movement-identifier ${isActive ? "is-active" : ""}`}
      onClick={onClick}
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

function DashboardMetric({ label, value, tone = "default", icon, customers = [] }) {
  return (
    <article
      className={`dashboard-metric dashboard-metric-${tone}`}
      title={
        customers.length
          ? customers.map((item) => `${item.customer_name} - ${item.container_count}`).join(", ")
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
                <strong>{item.container_count}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function SortableHeader({ label, columnKey, sortConfig, onSort }) {
  const isActive = sortConfig.key === columnKey;
  const indicator = !isActive ? "↕" : sortConfig.direction === "asc" ? "↑" : "↓";

  return (
    <th>
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

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            Close
          </button>
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
          Sign in with your tester account to work in your own isolated shipment workspace.
        </p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => onFieldChange("email", event.target.value)}
              placeholder="tester1@portal.local"
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
  const [shipments, setShipments] = useState([]);
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [manualForm, setManualForm] = useState(INITIAL_FORM);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [shipmentImportFile, setShipmentImportFile] = useState(null);
  const [shipmentImportPreview, setShipmentImportPreview] = useState(null);
  const [shipmentImportMapping, setShipmentImportMapping] = useState(INITIAL_MAPPING);
  const [shipmentImporting, setShipmentImporting] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [search, setSearch] = useState("");
  const [movementFilter, setMovementFilter] = useState("All");
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState({ key: "latest_time", direction: "desc" });
  const [documentUploadState, setDocumentUploadState] = useState({});
  const [locationDistanceMap, setLocationDistanceMap] = useState({});
  const [stickyHeaderActive, setStickyHeaderActive] = useState(false);
  const [stickyHeaderStyle, setStickyHeaderStyle] = useState({ left: 0, width: 0, scrollLeft: 0 });
  const [actionRow, setActionRow] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [clearancePrompt, setClearancePrompt] = useState(null);
  const [clearanceDocNumber, setClearanceDocNumber] = useState("");
  const [documentRow, setDocumentRow] = useState(null);
  const [documentFiles, setDocumentFiles] = useState({
    invoice: null,
    packing_list: null,
    bl_copy: null,
  });

  useEffect(() => {
    const { pathname, search } = window.location;
    if (pathname.startsWith("/api/shipments/bl-documents/file")) {
      window.location.replace(api.getBLDocumentUrl(new URLSearchParams(search).get("bl_number") || "", new URLSearchParams(search).get("document_type") || ""));
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

  const loadDashboard = useCallback(async (options = {}) => {
    const { silent = false } = options;

    if (!demoSessionEnabled && (!authChecked || !isAuthenticated)) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [shipmentsData, dashboardData] = await Promise.all([
        api.listShipments(),
        api.getShipmentDashboard(),
      ]);

      setShipments(Array.isArray(shipmentsData) ? shipmentsData : []);
      setDashboardRows(Array.isArray(dashboardData?.rows) ? dashboardData.rows : []);
      setDashboardIdentifiers(dashboardData?.identifiers || {
        total_at_icd_birgunj: 0,
        today_arrivals: 0,
        approaching_birgunj: 0,
        railed_out_this_week: 0,
        today_arrival_customers: [],
        approaching_birgunj_customers: [],
        railed_out_this_week_customers: [],
      });
    } catch (error) {
      if (!demoSessionEnabled && /authentication|unauthorized|missing authentication token/i.test(error.message || "")) {
        api.logout();
        setCurrentUser(null);
        setIsAuthenticated(false);
      }
      setFeedback({ tone: "error", text: error.message || "Failed to load shipments" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authChecked, demoSessionEnabled, isAuthenticated]);

  useEffect(() => {
    if (!authChecked) {
      return;
    }
    loadDashboard();
  }, [authChecked, loadDashboard]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }

    const timer = window.setInterval(async () => {
      try {
        await api.refreshAllTracking();
        await loadDashboard({ silent: true });
      } catch {
        // Keep visible state if auto-refresh fails.
      }
    }, 300000);

    return () => window.clearInterval(timer);
  }, [autoRefresh, loadDashboard]);

  useEffect(() => {
    const query = cleanText(manualForm.customer_name);

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

    api
      .getLocationDistances(locations)
      .then((data) => {
        if (!active) {
          return;
        }
        setLocationDistanceMap(data?.items || {});
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setLocationDistanceMap({});
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

  const normalizedRows = useMemo(
    () =>
      dashboardRows.map((row) => ({
        ...row,
        movement_category: normalizeMovementCategory(row.movement_category),
        container_numbers: Array.isArray(row.container_numbers) ? row.container_numbers : [],
        container_count:
          Number(row.container_count) ||
          (Array.isArray(row.container_numbers) ? row.container_numbers.length : 0),
      })),
    [dashboardRows]
  );

  const shipmentCounts = useMemo(() => {
    return shipments.reduce(
      (accumulator, shipment) => {
        const status = shipment.shipment_status || "active";
        accumulator.total += 1;
        accumulator[status] = (accumulator[status] || 0) + 1;
        return accumulator;
      },
      { total: 0, active: 0, completed: 0, archived: 0 }
    );
  }, [shipments]);

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
    const loweredSearch = search.trim().toLowerCase();

    const visibleRows = normalizedRows.filter((row) => {
      const matchesStatus =
        shipmentStatusFilter === "all" || row.shipment_status === shipmentStatusFilter;
      const matchesMovement =
        movementFilter === "All" || row.movement_category === movementFilter;
      const matchesSearch =
        !loweredSearch ||
        [
          row.customer_name,
          row.primary_container_number,
          row.bl_number,
          row.latest_location,
          row.train_no,
          row.shipment_status,
          ...(row.container_numbers || []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(loweredSearch);

      return matchesStatus && matchesMovement && matchesSearch;
    });

    return [...visibleRows].sort((left, right) => {
      const result =
        sortConfig.key === "latest_location"
          ? compareLocationByDistance(left.latest_location, right.latest_location, locationDistanceMap)
          : compareValues(left[sortConfig.key], right[sortConfig.key], sortConfig.key);
      return sortConfig.direction === "asc" ? result : -result;
    });
  }, [locationDistanceMap, movementFilter, normalizedRows, search, shipmentStatusFilter, sortConfig]);

  const handleSort = useCallback((key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const handleFieldChange = useCallback((field, value) => {
    setManualForm((current) => ({
      ...current,
      [field]: field === "container_number" || field === "bl_number" ? value.toUpperCase() : value,
    }));
  }, []);

  const handleAddShipment = useCallback(
    async (event) => {
      event.preventDefault();
      setFeedback(null);

      try {
        await api.addShipment({
          customer_name: manualForm.customer_name.trim(),
          container_number: manualForm.container_number.trim().toUpperCase(),
          bl_number: manualForm.bl_number.trim().toUpperCase(),
        });

        setManualForm(INITIAL_FORM);
        setFeedback({ tone: "success", text: "Shipment added successfully." });
        await loadDashboard({ silent: true });
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Failed to add shipment" });
      }
    },
    [loadDashboard, manualForm]
  );

  const handleShipmentImportPreview = useCallback(async () => {
    if (!shipmentImportFile) {
      setFeedback({ tone: "error", text: "Select an Excel file before detecting columns." });
      return;
    }

    setFeedback(null);
    setShipmentImportPreview(null);

    try {
      const preview = await api.previewShipmentImport(shipmentImportFile);
      setShipmentImportPreview(preview);
      setShipmentImportMapping(guessColumns(preview.available_columns));
      setFeedback({ tone: "success", text: "Columns detected. Review the mapping and continue." });
    } catch (error) {
      setFeedback({ tone: "error", text: error.message || "Shipment preview failed" });
    }
  }, [shipmentImportFile]);

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
      const data = await api.confirmShipmentImport({
        temp_file_token: shipmentImportPreview.temp_file_token,
        mapping_json: shipmentImportMapping,
      });

      setShipmentImportFile(null);
      setShipmentImportPreview(null);
      setShipmentImportMapping(INITIAL_MAPPING);
      setFeedback({
        tone: "success",
        text: `Import complete. Added ${data.imported_count ?? 0}, skipped ${data.duplicate_count ?? 0} duplicates and ${data.skipped_blank_count ?? 0} blank rows.`,
      });
      await loadDashboard({ silent: true });
    } catch (error) {
      setFeedback({ tone: "error", text: error.message || "Shipment import failed" });
    } finally {
      setShipmentImporting(false);
    }
  }, [loadDashboard, shipmentImportMapping, shipmentImportPreview]);

  const handleRefreshAllTracking = useCallback(async () => {
    setFeedback(null);
    setRefreshing(true);

    try {
      setFeedback({
        tone: "info",
        text: "Fetching live tracking from LDB and CONCOR. This can take a short while for multiple containers.",
      });
      const data = await api.refreshAllTracking();
      setFeedback({
        tone: "success",
        text: `Tracking refreshed for ${data.refreshed_count ?? 0} active containers.`,
      });
      await loadDashboard({ silent: true });
    } catch (error) {
      setFeedback({ tone: "error", text: error.message || "Refresh all failed" });
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard]);

  const handleRefreshGroup = useCallback(
    async (row) => {
      setFeedback(null);
      setRefreshing(true);

      try {
        setFeedback({
          tone: "info",
          text: "Fetching live tracking from LDB and CONCOR for the selected shipment group.",
        });
        const data = await api.refreshGroupTracking({
          bl_number: row.bl_number,
          container_numbers: row.container_numbers,
        });
        setFeedback({
          tone: "success",
          text: `Tracking refreshed for ${data.refreshed_count ?? 0} container(s).`,
        });
        await loadDashboard({ silent: true });
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Refresh failed" });
      } finally {
        setRefreshing(false);
      }
    },
    [loadDashboard]
  );

  const handleDocumentUpload = useCallback(
    async (blNumber, documentType, file) => {
      const stateKey = `${blNumber}:${documentType}`;
      setDocumentUploadState((current) => ({ ...current, [stateKey]: documentType }));
      setFeedback(null);

      try {
        await api.uploadBLDocument(blNumber, documentType, file);
        setFeedback({ tone: "success", text: `${documentType.replace("_", " ")} uploaded for ${blNumber}.` });
        await loadDashboard({ silent: true });
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
    [loadDashboard]
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
        setShipments((current) =>
          current.map((shipment) =>
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
          text: `${data.count ?? 0} shipment record(s) marked ${shipmentStatus}.`,
        });
        await loadDashboard({ silent: true });
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Status update failed" });
      }
    },
    [loadDashboard]
  );

  const handleGroupDelete = useCallback(
    async (row) => {
      setFeedback(null);
      try {
        const data = await api.deleteShipmentGroup({
          bl_number: row.bl_number,
          container_numbers: row.container_numbers,
        });
        setDashboardRows((current) => current.filter((item) => item.group_key !== row.group_key));
        setShipments((current) => current.filter((shipment) => !rowMatchesShipment(row, shipment)));
        setFeedback({
          tone: "success",
          text: `${data.count ?? 0} shipment record(s) removed.`,
        });
        await loadDashboard({ silent: true });
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Delete failed" });
      }
    },
    [loadDashboard]
  );

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
        await loadDashboard({ silent: true });
      } catch (error) {
        setFeedback({ tone: "error", text: error.message || "Authentication failed" });
      } finally {
        setAuthSubmitting(false);
      }
    },
    [authForm, authMode, loadDashboard]
  );

  const handleLogout = useCallback(() => {
    api.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setShipments([]);
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
      <section className="surface hero-panel">
        <div className="hero-watermark">SHIPMENT INTELLIGENCE</div>
        <div className="hero-copy-wrap">
          <p className="eyebrow">Shipment Control Center</p>
          <h1>Logistics Operations Dashboard</h1>
          <p className="hero-copy">
            A premium control tower for shipment records, movement visibility, and document readiness.
          </p>
        </div>

        <div className="hero-actions compact-actions">
          {!demoSessionEnabled && currentUser ? (
            <div className="session-chip">
              <span>{currentUser.email}</span>
              <button type="button" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          ) : null}
          <ActionButton type="button" tone="primary" onClick={() => loadDashboard({ silent: true })}>
            {refreshing ? "Refreshing..." : "Refresh Dashboard"}
          </ActionButton>
          <ActionButton type="button" tone="secondary" onClick={handleRefreshAllTracking}>
            Refresh Tracking
          </ActionButton>
          <label className="toggle-card compact-toggle">
            <span className="toggle-copy">
              <strong>Auto Refresh</strong>
              <span>Every 5 minutes</span>
            </span>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
          </label>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard label="Total Shipments" value={shipmentCounts.total} />
        <StatCard label="Active" value={shipmentCounts.active} />
        <StatCard label="Completed" value={shipmentCounts.completed} />
        <StatCard label="Archived" value={shipmentCounts.archived} />
      </section>

      {feedback && (
        <section className={`surface banner banner-${feedback.tone}`} aria-live="polite">
          {feedback.text}
        </section>
      )}

      <section className="workspace-grid">
        <article className="surface panel-card">
          <div className="panel-heading compact-heading">
            <div>
              <p className="eyebrow">Manual Intake</p>
              <h2>Add Shipment</h2>
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

            <label className="field-label" htmlFor="container_number">
              Container Number
            </label>
            <input
              id="container_number"
              value={manualForm.container_number}
              onChange={(event) => handleFieldChange("container_number", event.target.value)}
              placeholder="TCNU1491563"
            />

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

        <article className="surface panel-card">
          <div className="panel-heading compact-heading">
            <div>
              <p className="eyebrow">Bulk Intake</p>
              <h2>Import Shipments</h2>
            </div>
          </div>

          <div className="stack-form">
            <label className="field-label" htmlFor="shipment_import_file">
              Workbook File
            </label>
            <input
              id="shipment_import_file"
              type="file"
              accept=".xlsx,.xlsm"
              onChange={(event) => setShipmentImportFile(event.target.files?.[0] || null)}
            />

            <div className="button-row compact-row">
              <ActionButton type="button" tone="secondary" onClick={handleShipmentImportPreview}>
                Upload and Detect
              </ActionButton>
              {shipmentImportFile && <span className="file-chip">{shipmentImportFile.name}</span>}
            </div>
          </div>

          {shipmentImportPreview && (
            <div className="import-preview">
              <div className="preview-header">
                <div>
                  <h3>Column Mapping</h3>
                  <p>
                    Sheet <strong>{shipmentImportPreview.sheet_name}</strong>, Header Row{" "}
                    {shipmentImportPreview.header_row}
                  </p>
                </div>
                <span className="file-chip">{shipmentImportPreview.preview_rows?.length || 0} preview rows</span>
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
                {shipmentImporting ? "Importing..." : "Commit Import"}
              </ActionButton>
            </div>
          )}
        </article>
      </section>

      <section className="surface metrics-panel">
        <div className="panel-heading compact-heading">
          <div>
            <p className="eyebrow">Movement Summary</p>
            <h2>Container Position Indicators</h2>
          </div>
        </div>
        <div className="dashboard-header-metrics">
          <DashboardMetric
            label="At ICD Birgunj"
            value={dashboardIdentifiers.total_at_icd_birgunj || 0}
            tone="primary"
            icon={<MovementIcon type="Arrived Birgunj" />}
          />
          <DashboardMetric
            label="Today Arrivals"
            value={dashboardIdentifiers.today_arrivals || 0}
            tone="success"
            icon={<MovementIcon type="On Rail" />}
            customers={dashboardIdentifiers.today_arrival_customers || []}
          />
          <DashboardMetric
            label="Approaching Destination"
            value={dashboardIdentifiers.approaching_birgunj || 0}
            tone="warning"
            icon={
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4v10" />
                <path d="M8 8h8" />
                <path d="M6 18c1-.8 2-.8 3 0s2 .8 3 0 2-.8 3 0 2 .8 3 0" />
                <circle cx="12" cy="4" r="1.7" />
              </svg>
            }
            customers={dashboardIdentifiers.approaching_birgunj_customers || []}
          />
          <DashboardMetric
            label="Railed Out This Week"
            value={dashboardIdentifiers.railed_out_this_week || 0}
            tone="primary"
            icon={
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4h10c1.7 0 3 1.3 3 3v7c0 1.7-1.3 3-3 3H7c-1.7 0-3-1.3-3-3V7c0-1.7 1.3-3 3-3Z" />
                <path d="M7 17l-2 3M17 17l2 3M8 20h8M7 8h10M7 12h10" />
                <circle cx="8" cy="15" r="1" />
                <circle cx="16" cy="15" r="1" />
              </svg>
            }
            customers={dashboardIdentifiers.railed_out_this_week_customers || []}
          />
        </div>
      </section>

      <section className="surface dashboard-panel">
        <div className="dashboard-header compact-dashboard-header">
          <div>
            <p className="eyebrow">Live Dashboard</p>
            <h2>BL Movement Board</h2>
          </div>
        </div>

        <div className="filter-bar">
          <div className="movement-identifiers">
            {MOVEMENT_FILTERS.map((filter) => (
              <MovementIdentifier
                key={filter.value}
                filter={filter}
                isActive={movementFilter === filter.value}
                count={movementCounts[filter.value] || 0}
                onClick={() => setMovementFilter(filter.value)}
              />
            ))}
          </div>

          <div className="tool-row">
            <select value={shipmentStatusFilter} onChange={(event) => setShipmentStatusFilter(event.target.value)}>
              <option value="all">All Shipment Statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>

            <input
              className="search-input"
              placeholder="Search customer, BL, container, location, train"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {stickyHeaderActive && (
          <div
            className="dashboard-floating-head"
            style={{ left: `${stickyHeaderStyle.left}px`, width: `${stickyHeaderStyle.width}px` }}
            aria-hidden="true"
          >
            <div
              className="dashboard-floating-head-grid"
              style={{ transform: `translateX(-${stickyHeaderStyle.scrollLeft}px)` }}
            >
              <div>Customer</div>
              <div>Containers</div>
              <div>BL</div>
              <div>Status</div>
              <div>Movement</div>
              <div>Latest Location</div>
              <div>Latest Date</div>
              <div>Train No</div>
              <div>Departure</div>
              <div className="th-center">Documents</div>
              <div className="th-center">Actions</div>
            </div>
          </div>
        )}
        <div className="table-wrap" ref={tableWrapRef}>
          <table className="shipment-table dense-table">
            <thead>
              <tr>
                <SortableHeader label="Customer" columnKey="customer_name" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Containers" columnKey="container_number" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="BL" columnKey="bl_number" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Status" columnKey="shipment_status" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Movement" columnKey="movement_category" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Latest Location" columnKey="latest_location" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Latest Date" columnKey="latest_time" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Train No" columnKey="train_no" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Departure" columnKey="departure" sortConfig={sortConfig} onSort={handleSort} />
                <th className="th-center">Documents</th>
                <th className="th-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" className="empty-cell">
                    Loading shipments...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="11" className="empty-cell">
                    No shipments match the current filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  return (
                    <tr key={row.group_key || row.id}>
                      <td>
                        <div className="cell-title customer-name">{row.customer_name || "-"}</div>
                      </td>
                      <td>
                        <div className="container-list-cell">
                          {(row.container_numbers?.length ? row.container_numbers : [row.primary_container_number])
                            .filter(Boolean)
                            .join(", ") || "-"}
                        </div>
                      </td>
                      <td>{row.bl_number || "-"}</td>
                      <td>
                        <span className={badgeClass("status", row.shipment_status)}>
                          {row.shipment_status || "unknown"}
                        </span>
                      </td>
                      <td>
                        <span className={badgeClass("movement", row.movement_category)}>
                          {row.movement_category || "Hi Seas"}
                        </span>
                      </td>
                      <td>{row.latest_location || "Not available"}</td>
                      <td className="date-cell">{row.latest_time || "-"}</td>
                      <td>{row.train_no || "-"}</td>
                      <td className="date-cell">{row.departure || "-"}</td>
                      <td className="td-center">
                        <div className="docs-inline">
                          <span className={`docs-status ${row.documents_complete ? "is-complete" : ""}`}>
                            {row.documents_complete ? "Complete" : "Pending"}
                          </span>
                          <ActionButton type="button" tone="ghost" onClick={() => setDocumentRow(row)}>
                            {row.documents_complete ? "Documents Submitted" : "Submit Documents"}
                          </ActionButton>
                        </div>
                      </td>
                      <td className="td-center">
                        <div className="action-group compact-actions-row">
                          <ActionButton type="button" tone="ghost" onClick={() => setActionRow(row)}>
                            Take Action
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
      </section>

      {actionRow && (
        <Modal title={`Actions for ${actionRow.bl_number || actionRow.primary_container_number}`} onClose={() => setActionRow(null)}>
          <div className="modal-actions">
            <ActionButton type="button" tone="secondary" onClick={async () => {
              await handleRefreshGroup(actionRow);
              setActionRow(null);
            }}>
              Refresh Tracking
            </ActionButton>
            <ActionButton type="button" tone="ghost" onClick={() => setConfirmAction({ type: "active", row: actionRow })}>
              Activate
            </ActionButton>
            <ActionButton type="button" tone="ghost" onClick={() => setConfirmAction({ type: "completed", row: actionRow })}>
              Complete
            </ActionButton>
            <ActionButton type="button" tone="ghost" onClick={() => setConfirmAction({ type: "archived", row: actionRow })}>
              Archive
            </ActionButton>
            <ActionButton type="button" tone="danger" onClick={() => setConfirmAction({ type: "delete", row: actionRow })}>
              Delete
            </ActionButton>
          </div>
        </Modal>
      )}

      {confirmAction && (
        <Modal title="Confirm Action" onClose={() => setConfirmAction(null)}>
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
              onClick={async () => {
                if (confirmAction.type === "delete") {
                  await handleGroupDelete(confirmAction.row);
                } else if (confirmAction.type === "completed") {
                  setClearancePrompt(confirmAction.row);
                  setClearanceDocNumber("");
                } else {
                  await handleGroupStatusChange(confirmAction.row, confirmAction.type);
                }
                setConfirmAction(null);
                if (confirmAction.type !== "completed") {
                  setActionRow(null);
                }
              }}
            >
              Confirm
            </ActionButton>
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
                setActionRow(null);
              }}
            >
              Save and Complete
            </ActionButton>
          </div>
        </Modal>
      )}

      {documentRow && (
        <Modal title={`${documentRow.documents_complete ? "Manage Documents" : "Submit Documents"} for ${documentRow.bl_number}`} onClose={() => {
          setDocumentRow(null);
          setDocumentFiles({ invoice: null, packing_list: null, bl_copy: null });
        }}>
          <div className="document-form-grid">
            {DOCUMENT_FIELDS.map(([key, label]) => (
              <label className="document-field" key={key}>
                <span>{label}</span>
                {documentRow.documents?.[key] ? (
                  <button
                    type="button"
                    className="document-link"
                    onClick={() => handleOpenDocument(documentRow.bl_number, key)}
                  >
                    {documentRow.documents[key].original_name}
                  </button>
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
                  {documentFiles[key]?.name
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
              {documentRow.documents_complete ? "Save Changes" : "Submit Documents"}
            </ActionButton>
          </div>
        </Modal>
      )}
    </main>
  );
}

export default App;
