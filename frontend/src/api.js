const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const DEFAULT_REMOTE_API_BASE = "https://tracking-portal-v3-backend.onrender.com";
const CURRENT_HOSTNAME = typeof window !== "undefined" ? window.location.hostname : "";
const IS_LOCAL_HOST = LOCAL_HOSTS.has(CURRENT_HOSTNAME);
const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "")
  || (IS_LOCAL_HOST ? "http://127.0.0.1:8000" : DEFAULT_REMOTE_API_BASE);
const DEMO_SESSION_ENABLED = import.meta.env.VITE_ENABLE_DEMO_SESSION !== "false" && IS_LOCAL_HOST;
const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "change-me-local";
const SESSION_TOKEN_KEY = "tp_token";
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const RETRYABLE_METHODS = new Set(["GET", "HEAD"]);
const BROWSER_SESSION_STORAGE = typeof window !== "undefined" ? window.sessionStorage : null;
const BROWSER_LOCAL_STORAGE = typeof window !== "undefined" ? window.localStorage : null;
let portalSessionPromise = null;
let volatileToken = "";

function readStorageValue(storage) {
  try {
    return storage?.getItem(SESSION_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function writeStorageValue(storage, value) {
  try {
    if (value) {
      storage?.setItem(SESSION_TOKEN_KEY, value);
    } else {
      storage?.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore storage unavailability
  }
}

function normalizeErrorDetail(detail, fallback = "Request failed") {
  if (!detail) {
    return fallback;
  }
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item?.msg) {
          return item.msg;
        }
        return JSON.stringify(item);
      })
      .join("; ");
  }
  if (typeof detail === "object") {
    if (detail.msg) {
      return detail.msg;
    }
    return JSON.stringify(detail);
  }
  return String(detail);
}

function getToken() {
  if (volatileToken) {
    return volatileToken;
  }
  const sessionToken = readStorageValue(BROWSER_SESSION_STORAGE);
  if (sessionToken) {
    volatileToken = sessionToken;
    return sessionToken;
  }
  const legacyLocalToken = readStorageValue(BROWSER_LOCAL_STORAGE);
  if (legacyLocalToken) {
    volatileToken = legacyLocalToken;
    writeStorageValue(BROWSER_SESSION_STORAGE, legacyLocalToken);
    writeStorageValue(BROWSER_LOCAL_STORAGE, "");
    return legacyLocalToken;
  }
  return "";
}

function setToken(token) {
  volatileToken = token || "";
  writeStorageValue(BROWSER_SESSION_STORAGE, volatileToken);
  writeStorageValue(BROWSER_LOCAL_STORAGE, "");
}

export function isDemoSessionEnabled() {
  return DEMO_SESSION_ENABLED;
}

function isNetworkFailure(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.name === "TypeError"
    || error?.name === "NetworkError"
    || message.includes("failed to fetch")
    || message.includes("networkerror")
    || message.includes("load failed")
    || message.includes("fetch failed")
  );
}

function getFriendlyServiceMessage(path = "") {
  const normalizedPath = String(path || "").toLowerCase();

  if (normalizedPath.includes("/api/auth/login") || normalizedPath.includes("/api/auth/register")) {
    return "We couldn't reach the portal service just now. It may be restarting. Please try signing in again in a few seconds.";
  }

  if (normalizedPath.includes("/refresh-all") || normalizedPath.includes("/refresh-group") || normalizedPath.includes("/refresh-one")) {
    return "The live tracking service is temporarily unavailable. It may be restarting. Please try the refresh again in a few seconds.";
  }

  if (normalizedPath.includes("/bootstrap") || normalizedPath.includes("/dashboard")) {
    return "We couldn't load the latest dashboard data just now. The backend may be restarting. Please try again in a few seconds.";
  }

  if (normalizedPath.includes("/bl-documents")) {
    return "We couldn't reach the document service just now. Please try again in a few seconds.";
  }

  return "The portal service is temporarily unavailable right now. It may be restarting. Please try again in a few seconds.";
}

function decorateRequestError(error, path = "", fallback = "Request failed") {
  if (error instanceof Error && error.name === "AbortError") {
    return new Error("The request took too long. Please try again.");
  }

  if (isNetworkFailure(error)) {
    return new Error(getFriendlyServiceMessage(path));
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(fallback);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function safeFetch(url, options = {}, path = "") {
  const method = String(options.method || "GET").toUpperCase();
  const shouldRetry = RETRYABLE_METHODS.has(method);
  const timeoutMs = Number(options.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS);

  const execute = async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const mergedSignal = options.signal || controller.signal;
      return await fetch(url, { ...options, signal: mergedSignal });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  try {
    const response = await execute();
    if (shouldRetry && [502, 503, 504].includes(response.status)) {
      await delay(350);
      return await execute();
    }
    return response;
  } catch (error) {
    if (shouldRetry && isNetworkFailure(error)) {
      await delay(350);
      try {
        return await execute();
      } catch (retryError) {
        throw decorateRequestError(retryError, path, "Request failed");
      }
    }
    throw decorateRequestError(error, path, "Request failed");
  }
}

async function ensurePortalSession(path = "") {
  if (!path.startsWith("/api/shipments")) {
    return getToken();
  }

  const existingToken = getToken();
  if (existingToken) {
    return existingToken;
  }

  if (!DEMO_SESSION_ENABLED) {
    return null;
  }

  if (!portalSessionPromise) {
    portalSessionPromise = safeFetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    }, "/api/auth/login")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.access_token) {
          throw new Error(normalizeErrorDetail(data?.detail || data?.message, "Portal session failed"));
        }
        setToken(data.access_token);
        return data.access_token;
      })
      .finally(() => {
        portalSessionPromise = null;
      });
  }

  return portalSessionPromise;
}

async function handleResponse(response, path = "") {
  if (response.status === 204) {
    return {};
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (
      response.status === 401
      && !path.startsWith("/api/auth/login")
      && !path.startsWith("/api/auth/register")
    ) {
      throw new Error("Your session has expired. Please sign in again.");
    }
    throw new Error(normalizeErrorDetail(data?.detail || data?.message, "Request failed"));
  }

  return data;
}

async function request(path, options = {}) {
  const ensuredToken = await ensurePortalSession(path);
  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(ensuredToken ? { Authorization: `Bearer ${ensuredToken}` } : {}),
    ...(options.headers || {}),
  };

  const response = await safeFetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  }, path);

  return handleResponse(response, path);
}

async function requestBlob(path, options = {}) {
  const ensuredToken = await ensurePortalSession(path);
  const headers = {
    ...(ensuredToken ? { Authorization: `Bearer ${ensuredToken}` } : {}),
    ...(options.headers || {}),
  };

  const response = await safeFetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  }, path);

  if (!response.ok) {
    let detail = "Request failed";
    try {
      const data = await response.json();
      detail = normalizeErrorDetail(data?.detail || data?.message, detail);
    } catch {
      // ignore json parse issues for non-json responses
    }
    throw new Error(detail);
  }

  return {
    blob: await response.blob(),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

export const api = {
  register: (payload) =>
    request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((data) => {
      if (data?.access_token) {
        setToken(data.access_token);
      }
      return data;
    }),

  login: (payload) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((data) => {
      if (data?.access_token) {
        setToken(data.access_token);
      }
      return data;
    }),

  me: () => request("/api/auth/me"),
  changePassword: (payload) =>
    request("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAdminOverview: () => request("/api/auth/admin/overview"),
  getAdminUserShipments: (userId) => request(`/api/auth/admin/users/${encodeURIComponent(userId)}/shipments`),
  adminResetUserPassword: (payload) =>
    request("/api/auth/admin/reset-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminDeleteUser: (userId) =>
    request(`/api/auth/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    }),
  logout: () => setToken(""),
  hasSession: () => Boolean(getToken()),

  uploadWorkbook: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/api/uploads", { method: "POST", body: formData });
  },

  previewUpload: (id) => request(`/api/uploads/${id}/preview`),

  createTemplate: (payload) =>
    request("/api/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listTemplates: () => request("/api/templates"),

  processJob: (payload) =>
    request("/api/jobs/process", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listJobs: () => request("/api/jobs"),

  getJob: (id) => request(`/api/jobs/${id}`),

  listShipments: () => request("/api/shipments"),
  getShipmentDashboard: () => request("/api/shipments/dashboard"),
  getPortalBootstrap: ({ includeSources = true, includeShipments = true } = {}) =>
    request(
      `/api/shipments/bootstrap?include_sources=${includeSources ? "1" : "0"}&include_shipments=${includeShipments ? "1" : "0"}`
    ),
  downloadShipmentDashboardReport: () => requestBlob("/api/shipments/dashboard-export"),
  getShipmentStats: () => request("/api/shipments/stats"),
  getLocationDistances: (locations) =>
    request("/api/shipments/location-distances", {
      method: "POST",
      body: JSON.stringify({ locations }),
    }),
  getCustomerSuggestions: (query = "") =>
    request(`/api/shipments/customers?q=${encodeURIComponent(query)}`),

  addShipment: (payload) =>
    request("/api/shipments/add", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateShipmentGroupDetails: (payload) =>
    request("/api/shipments/actions/group/edit", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  updateShipmentStatus: (id, payload) =>
    request(`/api/shipments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  updateShipmentGroupStatus: (payload) =>
    request("/api/shipments/actions/group/status", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  updateBulkShipmentGroupStatus: (payload) =>
    request("/api/shipments/actions/bulk/status", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteShipment: (id) =>
    request(`/api/shipments/${id}`, {
      method: "DELETE",
    }),

  deleteShipmentGroup: (payload) =>
    request("/api/shipments/group/delete", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deleteBulkShipmentGroups: (payload) =>
    request("/api/shipments/group/delete-bulk", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  previewShipmentImport: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/api/shipments/import-preview", {
      method: "POST",
      body: formData,
    });
  },

  confirmShipmentImport: (payload) =>
    request("/api/shipments/import-confirm", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listShipmentSources: () => request("/api/shipments/sources"),

  listShipmentSourceMappings: () => request("/api/shipments/source-mappings"),

  listShipmentSourceConnections: () => request("/api/shipments/source-connections"),

  createGoogleSheetsConnection: (payload) =>
    request("/api/shipments/source-connections/google-sheets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  previewGoogleSheetSource: (payload) =>
    request("/api/shipments/source-connections/google-sheets/preview", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listShipmentSourceBatches: (limit = 20) =>
    request(`/api/shipments/source-batches?limit=${encodeURIComponent(limit)}`),

  getShipmentSourceBatch: (batchId) =>
    request(`/api/shipments/source-batches/${encodeURIComponent(batchId)}`),

  validateShipmentImport: (payload) =>
    request("/api/shipments/import-validate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  refreshAllTracking: () =>
    request("/api/shipments/refresh-all", {
      method: "POST",
    }),

  startRefreshAllTracking: () =>
    request("/api/shipments/refresh-all/start", {
      method: "POST",
    }),

  getRefreshAllTrackingStatus: (taskId) =>
    request(`/api/shipments/refresh-all/status/${encodeURIComponent(taskId)}`),

  getGroupAuditTrail: (payload) =>
    request("/api/shipments/audit/group", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  refreshOneTracking: (containerNumber) =>
    request("/api/shipments/refresh-one", {
      method: "POST",
      body: JSON.stringify({ container_number: containerNumber }),
    }),

  refreshGroupTracking: (payload) =>
    request("/api/shipments/refresh-group", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  uploadBLDocument: (blNumber, documentType, file) => {
    const formData = new FormData();
    formData.append("bl_number", blNumber);
    formData.append("document_type", documentType);
    formData.append("file", file);
    return request("/api/shipments/bl-documents/upload", {
      method: "POST",
      body: formData,
    });
  },

  fetchBLDocument: (blNumber, documentType) =>
    ensurePortalSession("/api/shipments/bl-documents/file").then(() =>
      requestBlob(
        `/api/shipments/bl-documents/file?bl_number=${encodeURIComponent(blNumber)}&document_type=${encodeURIComponent(documentType)}`,
        {},
      )
    ),

  getBLDocumentUrl: (blNumber, documentType) =>
    `${API_BASE}/api/shipments/bl-documents/file?bl_number=${encodeURIComponent(blNumber)}&document_type=${encodeURIComponent(documentType)}`,
};
