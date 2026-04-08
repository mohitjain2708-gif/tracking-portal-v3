const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";
const DEMO_SESSION_ENABLED = import.meta.env.VITE_ENABLE_DEMO_SESSION !== "false";
const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "change-me-local";
let portalSessionPromise = null;

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
  return localStorage.getItem("tp_token");
}

function setToken(token) {
  if (token) {
    localStorage.setItem("tp_token", token);
  } else {
    localStorage.removeItem("tp_token");
  }
}

export function getDocumentAuthToken() {
  return getToken() || "";
}

export function isDemoSessionEnabled() {
  return DEMO_SESSION_ENABLED;
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
    portalSessionPromise = fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    })
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

async function handleResponse(response) {
  if (response.status === 204) {
    return {};
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
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

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  return handleResponse(response);
}

async function requestBlob(path, options = {}) {
  const ensuredToken = await ensurePortalSession(path);
  const headers = {
    ...(ensuredToken ? { Authorization: `Bearer ${ensuredToken}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

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

async function requestBlobUrl(url, options = {}) {
  const response = await fetch(url, {
    ...options,
  });

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

  deleteShipment: (id) =>
    request(`/api/shipments/${id}`, {
      method: "DELETE",
    }),

  deleteShipmentGroup: (payload) =>
    request("/api/shipments/group/delete", {
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
      requestBlobUrl(
        `${API_BASE}/api/shipments/bl-documents/file?bl_number=${encodeURIComponent(blNumber)}&document_type=${encodeURIComponent(documentType)}&access_token=${encodeURIComponent(getDocumentAuthToken())}`
      )
    ),

  getBLDocumentUrl: (blNumber, documentType) =>
    `${API_BASE}/api/shipments/bl-documents/file?bl_number=${encodeURIComponent(blNumber)}&document_type=${encodeURIComponent(documentType)}&access_token=${encodeURIComponent(getDocumentAuthToken())}`,
};
