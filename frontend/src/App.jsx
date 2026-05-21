import React, { lazy, startTransition, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, isDemoSessionEnabled } from "./api";
import {
  DOCUMENT_FIELDS,
  DOCUMENT_STATUS_OPTIONS,
  IMPORT_FILE_SIZE_LIMIT_MB,
  INITIAL_FORM,
  INITIAL_GOOGLE_SHEET_STATE,
  INITIAL_MAPPING,
  INITIAL_PASSWORD_FORM,
  MAPPING_FIELDS,
  MOVEMENT_FILTERS,
  SHIPMENT_STATUS_FILTERS,
  STATUS_OPTIONS,
} from "./constants/portalConstants";
import AuthScreen from "./views/auth/AuthScreen";
import IntakeWorkspace from "./views/portal/IntakeWorkspace";
import PortalLandingExperience, { buildPortalLandingModel } from "./views/portal/PortalLandingExperience";
import {
  applyOperationalFieldUpdate,
  applyShipmentOverlayUpdate,
  badgeClass,
  buildGroupedRowsFromShipments,
  cleanText,
  compareLocationByDistance,
  compareDateStrings,
  compareValues,
  exportRowsAsCsv,
  formatDateTimeLabel,
  formatDocumentStatusSummary,
  formatImportCompletionText,
  formatLocationLabel,
  formatRefreshStatusLabel,
  formatShipmentStatusLabel,
  fromInputDateValue,
  guessColumns,
  hasDoDateDraftChanges,
  hasDocumentDraftChanges,
  isValidContainerNumber,
  normalizeMovementCategory,
  normalizeMovementDiagnostics,
  parseContainerInput,
  rowMatchesSearch,
  rowMatchesShipment,
  toInputDateValue,
} from "./lib/portalUtils";

const OwnerPanel = lazy(() => import("./views/portal/OwnerPanel"));
const PortalModalLayer = lazy(() => import("./views/portal/PortalModalLayer"));
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
    <Suspense fallback={null}>
      <OwnerPanel
        adminOverview={adminOverview}
        adminLoading={adminLoading}
        refreshAdminOverview={refreshAdminOverview}
        handleViewOwnerUserShipments={handleViewOwnerUserShipments}
        ownerUserShipmentsLoading={ownerUserShipmentsLoading}
        ownerUserShipments={ownerUserShipments}
        setOwnerDeleteUser={setOwnerDeleteUser}
        adminResetState={adminResetState}
        setAdminResetState={setAdminResetState}
        adminResetSubmitting={adminResetSubmitting}
        handleAdminResetPassword={handleAdminResetPassword}
      />
    </Suspense>
  ) : null;

  const hasPortalOverlayOpen =
    Boolean(actionRow) ||
    Boolean(confirmAction) ||
    Boolean(bulkConfirmAction) ||
    Boolean(clearancePrompt) ||
    Boolean(rowContextMenu) ||
    Boolean(quickEditRow) ||
    Boolean(documentRow) ||
    Boolean(recordsView) ||
    Boolean(auditRow) ||
    Boolean(shipmentImportReviewOpen) ||
    (Boolean(shipmentImportPreview) && shipmentImportSourceContext?.source_type === "google_sheets") ||
    Boolean(sourceBatchDetail) ||
    Boolean(ownerUserShipments) ||
    Boolean(ownerDeleteUser) ||
    Boolean(editRow) ||
    Boolean(passwordModalOpen);

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

      <IntakeWorkspace
        activeIntakePanel={activeIntakePanel}
        setActiveIntakePanel={setActiveIntakePanel}
        customerSuggestions={customerSuggestions}
        manualForm={manualForm}
        handleFieldChange={handleFieldChange}
        handleAddShipment={handleAddShipment}
        shipmentImportFile={shipmentImportFile}
        setShipmentImportFile={setShipmentImportFile}
        handleShipmentImportPreview={handleShipmentImportPreview}
        sourceBatches={sourceBatches}
        sourceMappings={sourceMappings}
        openSourceBatchDetail={openSourceBatchDetail}
        shipmentImportPreview={shipmentImportPreview}
        shipmentImportSourceContext={shipmentImportSourceContext}
        shipmentImportMapping={shipmentImportMapping}
        setShipmentImportMapping={setShipmentImportMapping}
        shipmentImporting={shipmentImporting}
        handleShipmentImportConfirm={handleShipmentImportConfirm}
        shipmentImportReviewSummary={shipmentImportReviewSummary}
        setShipmentImportReviewOpen={setShipmentImportReviewOpen}
        googleSheetState={googleSheetState}
        googleSheetLoading={googleSheetLoading}
        handleGoogleSheetUrlChange={handleGoogleSheetUrlChange}
        handleGoogleSheetFetch={handleGoogleSheetFetch}
        setGoogleSheetState={setGoogleSheetState}
        handleGoogleSheetSelectPreview={handleGoogleSheetSelectPreview}
        sourceConnections={sourceConnections}
      />
      <Suspense fallback={null}>
        {hasPortalOverlayOpen ? (
          <PortalModalLayer
            actionRow={actionRow}
            actionReturnRow={actionReturnRow}
            closeActionModal={closeActionModal}
            handleRefreshGroup={handleRefreshGroup}
            setAuditRow={setAuditRow}
            setActionRow={setActionRow}
            setActionReturnRow={setActionReturnRow}
            setEditReturnRow={setEditReturnRow}
            openEditShipment={openEditShipment}
            setConfirmAction={setConfirmAction}
            setFeedback={setFeedback}
            confirmAction={confirmAction}
            handleGroupDelete={handleGroupDelete}
            setClearancePrompt={setClearancePrompt}
            setClearanceDocNumber={setClearanceDocNumber}
            handleGroupStatusChange={handleGroupStatusChange}
            bulkConfirmAction={bulkConfirmAction}
            setBulkConfirmAction={setBulkConfirmAction}
            selectedRows={selectedRows}
            bulkClearanceMap={bulkClearanceMap}
            setBulkClearanceMap={setBulkClearanceMap}
            setSelectedGroupKeys={setSelectedGroupKeys}
            handleBulkDelete={handleBulkDelete}
            handleBulkStatusChange={handleBulkStatusChange}
            clearancePrompt={clearancePrompt}
            setClearancePrompt={setClearancePrompt}
            clearanceDocNumber={clearanceDocNumber}
            rowContextMenu={rowContextMenu}
            setRowContextMenu={setRowContextMenu}
            setQuickEditRow={setQuickEditRow}
            quickEditRow={quickEditRow}
            getOperationalDraft={getOperationalDraft}
            setOperationalDraftValue={setOperationalDraftValue}
            fieldSavingKeys={fieldSavingKeys}
            saveQuickEditDraft={saveQuickEditDraft}
            documentRow={documentRow}
            setDocumentRow={setDocumentRow}
            setDocumentFiles={setDocumentFiles}
            documentFiles={documentFiles}
            documentUploadState={documentUploadState}
            handleOpenDocument={handleOpenDocument}
            handleDownloadDocument={handleDownloadDocument}
            handleDocumentSubmit={handleDocumentSubmit}
            recordsView={recordsView}
            setRecordsView={setRecordsView}
            recordsSearch={recordsSearch}
            setRecordsSearch={setRecordsSearch}
            recordsMovementFilter={recordsMovementFilter}
            setRecordsMovementFilter={setRecordsMovementFilter}
            visibleHistoryRows={visibleHistoryRows}
            auditRow={auditRow}
            relatedCycleRows={relatedCycleRows}
            auditRelatedCyclesExpanded={auditRelatedCyclesExpanded}
            setAuditRelatedCyclesExpanded={setAuditRelatedCyclesExpanded}
            auditJournalExpanded={auditJournalExpanded}
            setAuditJournalExpanded={setAuditJournalExpanded}
            auditEntries={auditEntries}
            handleOperationalFieldSave={handleOperationalFieldSave}
            saveDoDateDraft={saveDoDateDraft}
            saveDocumentDraft={saveDocumentDraft}
            auditControlsExpanded={auditControlsExpanded}
            setAuditControlsExpanded={setAuditControlsExpanded}
            shipmentImportReviewOpen={shipmentImportReviewOpen}
            setShipmentImportReviewOpen={setShipmentImportReviewOpen}
            shipmentImporting={shipmentImporting}
            handleImportReviewRecheck={handleImportReviewRecheck}
            shipmentImportReviewSummary={shipmentImportReviewSummary}
            shipmentImportReviewRows={shipmentImportReviewRows}
            handleImportReviewFieldChange={handleImportReviewFieldChange}
            shipmentImportPreview={shipmentImportPreview}
            shipmentImportSourceContext={shipmentImportSourceContext}
            resetShipmentImportState={resetShipmentImportState}
            handleShipmentImportConfirm={handleShipmentImportConfirm}
            shipmentImportMapping={shipmentImportMapping}
            setShipmentImportMapping={setShipmentImportMapping}
            sourceBatchDetail={sourceBatchDetail}
            setSourceBatchDetail={setSourceBatchDetail}
            ownerUserShipments={ownerUserShipments}
            setOwnerUserShipments={setOwnerUserShipments}
            ownerDeleteUser={ownerDeleteUser}
            setOwnerDeleteUser={setOwnerDeleteUser}
            ownerDeletingUser={ownerDeletingUser}
            handleDeleteOwnerUser={handleDeleteOwnerUser}
            editRow={editRow}
            closeEditModal={closeEditModal}
            handleEditShipment={handleEditShipment}
            editForm={editForm}
            handleEditFieldChange={handleEditFieldChange}
            editSubmitting={editSubmitting}
            currentUser={currentUser}
            passwordModalOpen={passwordModalOpen}
            setPasswordModalOpen={setPasswordModalOpen}
            passwordForm={passwordForm}
            handlePasswordFieldChange={handlePasswordFieldChange}
            passwordSubmitting={passwordSubmitting}
            handleChangePassword={handleChangePassword}
            setPasswordForm={setPasswordForm}
          />
        ) : null}
      </Suspense>
    </main>
  );
}

export default App;







