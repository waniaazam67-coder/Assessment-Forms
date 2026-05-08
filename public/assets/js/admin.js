const AUTH_KEY = "shehersaaz-management-dashboard-auth";
const MANAGEMENT_EMAIL = "beenish.kulsoom@shehersaaz.org.pk";
const DASHBOARD_VERSION = window.__SHEHERSAAZ_APP__?.APP_VERSION || "2026-05-online-only-01";
const isLocalFrontendDev = ["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port === "5173";

const getConfiguredApiBaseUrl = () => {
  const metaTag = document.querySelector('meta[name="api-base-url"]');
  const configuredValue = window.__SHEHERSAAZ_API_BASE_URL__ || metaTag?.getAttribute("content") || "";
  return String(configuredValue || "").trim().replace(/\/+$/, "");
};

const getApiBaseUrlCandidates = () => {
  if (window.location.protocol === "file:" || isLocalFrontendDev) {
    return ["http://127.0.0.1:4000"];
  }

  const configuredBaseUrl = getConfiguredApiBaseUrl();
  const candidates = [];
  if (configuredBaseUrl) {
    candidates.push(configuredBaseUrl);
  }
  candidates.push(window.location.origin);
  return Array.from(new Set(candidates.filter(Boolean)));
};

const backendBaseUrls = getApiBaseUrlCandidates();
window.__SHEHERSAAZ_APP__?.registerServiceWorker?.();

function readJson(storage, key, fallback) {
  try {
    const value = storage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function getAdminSession() {
  return readJson(sessionStorage, AUTH_KEY, null);
}

function getAdminAuthHeaders(extraHeaders = {}) {
  const session = getAdminSession();
  const token = String(session?.token || "").trim();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

async function apiJsonRequest(path, requestOptions = {}) {
  const headers = {
    Accept: "application/json",
    ...getAdminAuthHeaders(requestOptions.headers || {}),
  };
  let lastError = null;

  for (const baseUrl of backendBaseUrls) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...requestOptions,
        cache: requestOptions.cache || "no-store",
        headers,
      });

      if (!response.ok) {
        let message = `Request failed with status ${response.status}`;
        try {
          const payload = await response.json();
          if (payload?.error) {
            message = payload.error;
          }
        } catch (error) {
          // Keep default message if error body is not JSON.
        }
        const requestError = new Error(message);
        requestError.status = response.status;
        throw requestError;
      }

      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to reach the backend API.");
}

async function apiDownloadRequest(path, fallbackFilename) {
  let lastError = null;

  for (const baseUrl of backendBaseUrls) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        cache: "no-store",
        headers: getAdminAuthHeaders(),
      });

      if (!response.ok) {
        let message = `Request failed with status ${response.status}`;
        try {
          const payload = await response.json();
          if (payload?.error) {
            message = payload.error;
          }
        } catch (error) {
          // Keep default message if error body is not JSON.
        }
        const requestError = new Error(message);
        requestError.status = response.status;
        throw requestError;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/i);
      const filename = filenameMatch?.[1] || fallbackFilename;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return filename;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to reach the backend API.");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatusTone(label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (normalized === "submitted" || normalized === "inserted") {
    return "done";
  }
  if (normalized === "pending sync" || normalized === "pending" || normalized === "syncing") {
    return "pending";
  }
  if (normalized === "failed sync" || normalized === "failed") {
    return "failed";
  }
  return "neutral";
}

function isFullyCompleted(household) {
  return household?.stages?.householdInfo?.submitted &&
    household?.stages?.seaf?.submitted &&
    household?.stages?.engineering?.submitted &&
    household?.stages?.inventory?.submitted;
}

function getHouseholdSearchText(household) {
  return [household.householdId, household.headName, household.location, household.city, household.phone]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getHouseholdDateValue(household) {
  return String(household?.surveyDate || household?.updatedAt || "").trim();
}

function isWithinDateRange(value, startDate = "", endDate = "") {
  if (!value) {
    return !startDate && !endDate;
  }

  const normalizedValue = value.includes("T") ? value.slice(0, 10) : value;
  if (startDate && normalizedValue < startDate) {
    return false;
  }
  if (endDate && normalizedValue > endDate) {
    return false;
  }
  return true;
}

function filterHouseholds(households, options = {}) {
  const normalizedLocation = String(options.location || "all").trim().toLowerCase();
  const startDate = String(options.startDate || "").trim();
  const endDate = String(options.endDate || "").trim();

  return households.filter((household) => {
    if (!isWithinDateRange(getHouseholdDateValue(household), startDate, endDate)) {
      return false;
    }
    if (normalizedLocation !== "all" && !getHouseholdSearchText(household).includes(normalizedLocation)) {
      return false;
    }
    return true;
  });
}

function renderSummaryCards(container, summary = {}) {
  if (!container) {
    return;
  }

  const cards = [
    ["Total Households", summary.totalHouseholds || 0],
    ["Ineligible HH", summary.ineligibleHouseholds || 0],
    ["SEAF Submitted", summary.seafSubmitted || 0],
    ["Engineering Submitted", summary.engineeringSubmitted || 0],
    ["Inventory Submitted", summary.inventorySubmitted || 0],
    ["Fully Completed", summary.fullyCompleted || 0],
    ["Incomplete", summary.incomplete || 0],
  ];

  container.innerHTML = cards.map(
    ([label, value]) => `
      <article class="admin-overview-card admin-metric admin-metric--compact${label === "Ineligible HH" ? " is-clickable" : ""}"${label === "Ineligible HH" ? ' data-admin-open-ineligible-dialog="true"' : ""}>
        <span class="admin-metric__label">${escapeHtml(label)}</span>
        <strong class="admin-metric__value">${escapeHtml(value)}</strong>
      </article>
    `
  ).join("");
}

function renderHouseholdTable(container, households, onViewDetails) {
  if (!container) {
    return;
  }

  if (!households.length) {
    container.innerHTML = `<tr><td colspan="11" class="admin-table__empty">No households found.</td></tr>`;
    return;
  }

  container.innerHTML = households.map((household) => `
    <tr>
      <td>${escapeHtml(household.householdId || "-")}</td>
      <td>${escapeHtml(household.headName || "-")}</td>
      <td>${escapeHtml(household.location || "-")}</td>
      <td>${escapeHtml(household.surveyDate || "-")}</td>
      <td>${escapeHtml(household.phone || "-")}</td>
      <td><span class="admin-chip admin-chip--${getStatusTone(household.stages.householdInfo.label)}">${escapeHtml(household.stages.householdInfo.label)}</span></td>
      <td><span class="admin-chip admin-chip--${getStatusTone(household.stages.seaf.label)}">${escapeHtml(household.stages.seaf.label)}</span></td>
      <td><span class="admin-chip admin-chip--${getStatusTone(household.stages.engineering.label)}">${escapeHtml(household.stages.engineering.label)}</span></td>
      <td><span class="admin-chip admin-chip--${getStatusTone(household.stages.inventory.label)}">${escapeHtml(household.stages.inventory.label)}</span></td>
      <td>${escapeHtml(formatDateTime(household.updatedAt))}</td>
      <td><button type="button" class="admin-button admin-button--ghost admin-button--small" data-household-details="${escapeHtml(household.householdId)}">View Details</button></td>
    </tr>
  `).join("");

  container.querySelectorAll("[data-household-details]").forEach((button) => {
    button.addEventListener("click", () => {
      onViewDetails(button.getAttribute("data-household-details") || "");
    });
  });
}

function renderDetailsPanel(container, household) {
  if (!container) {
    return;
  }

  if (!household) {
    container.innerHTML = `<div class="admin-placeholder">No household found.</div>`;
    return;
  }

  const stageCard = (label, stage) => `
    <article class="admin-summary-card">
      <strong>${escapeHtml(label)}</strong>
      <span><span class="admin-chip admin-chip--${getStatusTone(stage?.label)}">${escapeHtml(stage?.label || "Not Submitted")}</span></span>
      <span>Submitted at: ${escapeHtml(formatDateTime(stage?.submittedAt))}</span>
    </article>
  `;

  container.innerHTML = `
    <div class="admin-details-grid">
      <article class="admin-summary-card">
        <strong>${escapeHtml(household.householdId || "-")}</strong>
        <span>Household ID</span>
      </article>
      <article class="admin-summary-card">
        <strong>${escapeHtml(household.headName || "-")}</strong>
        <span>Head Name</span>
      </article>
      <article class="admin-summary-card">
        <strong>${escapeHtml(household.location || "-")}</strong>
        <span>Location</span>
      </article>
      <article class="admin-summary-card">
        <strong>${escapeHtml(household.surveyDate || "-")}</strong>
        <span>Survey Date</span>
      </article>
      <article class="admin-summary-card">
        <strong>${escapeHtml(household.phone || "-")}</strong>
        <span>Phone</span>
      </article>
      <article class="admin-summary-card">
        <strong>${escapeHtml(household.eligibilityStatus || "-")}</strong>
        <span>Eligibility</span>
      </article>
      <article class="admin-summary-card">
        <strong>${escapeHtml(household.ineligibleReason || "-")}</strong>
        <span>Ineligible Reason</span>
      </article>
    </div>
    <div class="admin-details-grid">
      <article class="admin-summary-card">
        <strong>${escapeHtml(household.engineerName || "-")}</strong>
        <span>Engineer Name</span>
      </article>
      <article class="admin-summary-card">
        <strong>${escapeHtml(household.slope || "-")}</strong>
        <span>Slope</span>
      </article>
      <article class="admin-summary-card">
        <strong>${escapeHtml(household.natureOfOwnershipDocuments || "-")}</strong>
        <span>Nature of Ownership Documents</span>
      </article>
    </div>
    <div class="admin-details-stages">
      ${stageCard("Household Information", household.stages.householdInfo)}
      ${stageCard("SEAF", household.stages.seaf)}
      ${stageCard("Engineering", household.stages.engineering)}
      ${stageCard("Inventory", household.stages.inventory)}
    </div>
  `;
}

function downloadCsv(filename, households) {
  const headers = [
    "Household ID",
    "Head Name",
    "Location",
    "Phone",
    "Household Info Status",
    "SEAF Status",
    "Engineering Status",
    "Inventory Status",
    "Last Updated",
  ];

  const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
  const lines = [
    headers.map(escapeCsv).join(","),
    ...households.map((household) => [
      household.householdId || "",
      household.headName || "",
      household.location || "",
      household.phone || "",
      household.stages.householdInfo.label || "",
      household.stages.seaf.label || "",
      household.stages.engineering.label || "",
      household.stages.inventory.label || "",
      household.updatedAt || "",
    ].map(escapeCsv).join(",")),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderAdminUsers(container, users = []) {
  if (!container) {
    return;
  }

  if (!users.length) {
    container.innerHTML = `<tr><td colspan="5" class="admin-table__empty">No admin users found.</td></tr>`;
    return;
  }

  container.innerHTML = users.map((user) => `
    <tr>
      <td>${escapeHtml(user.name || "-")}</td>
      <td>${escapeHtml(user.email || "-")}</td>
      <td>${escapeHtml(user.role || "-")}</td>
      <td><span class="admin-chip admin-chip--${user.isActive ? "done" : "failed"}">${user.isActive ? "Active" : "Inactive"}</span></td>
      <td>${escapeHtml(formatDateTime(user.createdAt))}</td>
    </tr>
  `).join("");
}

function renderSyncMonitoring(summaryContainer, tableBody, placeholder, payload) {
  if (!summaryContainer || !tableBody || !placeholder) {
    return;
  }

  const summary = payload?.summary || {};
  const attempts = Array.isArray(payload?.recentAttempts) ? payload.recentAttempts : [];
  const hasCentralLog = Boolean(summary.hasCentralLog);

  if (!hasCentralLog) {
    summaryContainer.innerHTML = "";
    tableBody.innerHTML = "";
    placeholder.hidden = false;
    placeholder.textContent = "This app currently stores offline sync queue data on field devices. No central backend sync log is available yet.";
    return;
  }

  placeholder.hidden = true;
  summaryContainer.innerHTML = [
    ["Pending Sync", summary.pendingCount || 0],
    ["Failed Sync", summary.failedCount || 0],
    ["Submitted", summary.submittedCount || 0],
  ].map(([label, value]) => `
    <article class="admin-summary-card">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `).join("");

  tableBody.innerHTML = attempts.length ? attempts.map((item) => `
    <tr>
      <td>${escapeHtml(item.localSubmissionId || "-")}</td>
      <td>${escapeHtml(item.householdId || "-")}</td>
      <td>${escapeHtml(item.formType || "-")}</td>
      <td><span class="admin-chip admin-chip--${getStatusTone(item.syncStatus)}">${escapeHtml(item.syncStatus || "-")}</span></td>
      <td>${escapeHtml(item.retryCount || 0)}</td>
      <td>${escapeHtml(formatDateTime(item.updatedAt))}</td>
      <td>${escapeHtml(item.lastError || "-")}</td>
    </tr>
  `).join("") : `<tr><td colspan="7" class="admin-table__empty">No sync attempts found.</td></tr>`;
}

function renderDuplicates(tableBody, placeholder, payload) {
  if (!tableBody || !placeholder) {
    return;
  }

  const rows = Array.isArray(payload?.duplicates) ? payload.duplicates : [];
  if (!payload?.hasCentralLog) {
    tableBody.innerHTML = "";
    placeholder.hidden = false;
    placeholder.textContent = "Duplicate prevention is handled by localSubmissionId, but no central duplicate log table is available yet.";
    return;
  }

  placeholder.hidden = true;
  tableBody.innerHTML = rows.length ? rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.localSubmissionId || "-")}</td>
      <td>${escapeHtml(row.householdId || "-")}</td>
      <td>${escapeHtml(row.formType || "-")}</td>
      <td><span class="admin-chip admin-chip--${getStatusTone(row.result)}">${escapeHtml(row.result || "-")}</span></td>
      <td>${escapeHtml(formatDateTime(row.timestamp))}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="admin-table__empty">No duplicate visibility rows found.</td></tr>`;
}

function renderHealth(container, payload) {
  if (!container) {
    return;
  }

  container.innerHTML = [
    ["Backend Health", payload?.backend || "Unknown"],
    ["Database", payload?.database || "Unknown"],
    ["Dashboard Version", DASHBOARD_VERSION],
    ["Admin Users", payload?.adminUserCount || 0],
    ["Sync Records", payload?.syncSubmissionCount || 0],
    ["Last Checked", formatDateTime(payload?.checkedAt)],
  ].map(([label, value]) => `
    <article class="admin-summary-card">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `).join("");
}

function bootLoginPage() {
  const form = document.querySelector("[data-admin-login-form]");
  const feedback = document.querySelector("[data-admin-feedback]");
  const submitButton = form?.querySelector('button[type="submit"]');
  const passwordInput = form?.querySelector("[data-password-input]");
  const passwordToggle = form?.querySelector("[data-password-toggle]");

  const existing = sessionStorage.getItem(AUTH_KEY);
  if (existing) {
    window.location.href = `dashboard.html?t=${Date.now()}`;
    return;
  }

  passwordToggle?.addEventListener("click", () => {
    const isVisible = passwordInput?.getAttribute("type") === "text";
    if (!passwordInput) {
      return;
    }
    passwordInput.setAttribute("type", isVisible ? "password" : "text");
    passwordToggle.setAttribute("aria-pressed", String(!isVisible));
    passwordToggle.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "").trim();

    if (feedback) {
      feedback.textContent = "";
    }
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Signing in...";
    }

    try {
      const result = await apiJsonRequest("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      sessionStorage.setItem(AUTH_KEY, JSON.stringify({
        token: result?.session?.token || "",
        email: result?.session?.email || email || MANAGEMENT_EMAIL,
        name: result?.session?.name || "Management User",
      }));
      window.location.href = `dashboard.html?t=${Date.now()}`;
    } catch (error) {
      if (feedback) {
        feedback.textContent = error?.status === 401
          ? "Invalid management credentials."
          : "Unable to reach the backend. Start the backend server and try again.";
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Login";
      }
    }
  });
}

async function bootDashboardPage() {
  const session = readJson(sessionStorage, AUTH_KEY, null);
  if (!session) {
    window.location.href = `index.html?t=${Date.now()}`;
    return;
  }

  const state = {
    dashboard: { summary: {}, households: [], ineligibleHouseholds: [] },
    users: [],
    syncMonitoring: null,
    duplicates: null,
    health: null,
  };

  const elements = {
    name: document.querySelector("[data-admin-user-name]"),
    email: document.querySelector("[data-admin-user-email]"),
    feedback: document.querySelector("[data-admin-dashboard-feedback]"),
    title: document.querySelector("[data-admin-page-title]"),
    pages: Array.from(document.querySelectorAll("[data-admin-page]")),
    navLinks: Array.from(document.querySelectorAll("[data-admin-nav-link]")),
    summaryCards: document.querySelector("[data-admin-summary-cards]"),
    filterLocation: document.querySelector("[data-admin-filter-location]"),
    filterStartDate: document.querySelector("[data-admin-filter-start-date]"),
    filterEndDate: document.querySelector("[data-admin-filter-end-date]"),
    householdTableBody: document.querySelector("[data-admin-household-table-body]"),
    detailsSelect: document.querySelector("[data-admin-details-select]"),
    detailsPanel: document.querySelector("[data-admin-details-panel]"),
    refreshButton: document.querySelector("[data-admin-refresh]"),
    refreshHealthButton: document.querySelector("[data-admin-refresh-health]"),
    logoutButton: document.querySelector("[data-admin-logout]"),
    exportSeafCsv: document.querySelector("[data-admin-export-seaf-csv]"),
    exportEngineeringCsv: document.querySelector("[data-admin-export-engineering-csv]"),
    exportInventoryCsv: document.querySelector("[data-admin-export-inventory-csv]"),
    exportCombinedCsv: document.querySelector("[data-admin-export-combined-csv]"),
    exportFailedCombinedCsv: document.querySelector("[data-admin-export-failed-combined-csv]"),
    exportStartDate: document.querySelector("[data-admin-export-start-date]"),
    exportEndDate: document.querySelector("[data-admin-export-end-date]"),
    exportFeedback: document.querySelector("[data-admin-export-feedback]"),
    syncSummary: document.querySelector("[data-admin-sync-summary]"),
    syncTableBody: document.querySelector("[data-admin-sync-table-body]"),
    syncPlaceholder: document.querySelector("[data-admin-sync-placeholder]"),
    duplicatesTableBody: document.querySelector("[data-admin-duplicates-table-body]"),
    duplicatesPlaceholder: document.querySelector("[data-admin-duplicates-placeholder]"),
    usersTableBody: document.querySelector("[data-admin-users-table-body]"),
    healthSummary: document.querySelector("[data-admin-health-summary]"),
    ineligibleDialog: document.querySelector("[data-admin-ineligible-dialog]"),
    ineligibleClose: document.querySelector("[data-admin-ineligible-close]"),
    ineligibleList: document.querySelector("[data-admin-ineligible-list]"),
    ineligibleDetail: document.querySelector("[data-admin-ineligible-detail]"),
  };

  const pageTitles = {
    overview: "Overview",
    "household-details": "Household Details",
    export: "Export Data",
    "sync-monitoring": "Sync Monitoring",
    duplicates: "Duplicate Prevention",
    "admin-users": "Admin Users",
    "system-health": "System Health",
  };

  const getFilteredHouseholds = () => filterHouseholds(state.dashboard.households, {
    location: elements.filterLocation?.value || "all",
    startDate: elements.filterStartDate?.value || "",
    endDate: elements.filterEndDate?.value || "",
  });

  const getSelectedHousehold = () => {
    const householdId = elements.detailsSelect?.value || "";
    return state.dashboard.households.find((item) => item.householdId === householdId) || null;
  };

  const renderDetailsSelector = () => {
    if (!elements.detailsSelect) {
      return;
    }

    const visibleHouseholds = getFilteredHouseholds();
    elements.detailsSelect.innerHTML = `<option value="">Choose household</option>${visibleHouseholds.map((household) => `
      <option value="${escapeHtml(household.householdId)}">${escapeHtml(household.householdId)}${household.headName ? ` - ${escapeHtml(household.headName)}` : ""}</option>
    `).join("")}`;
  };

  const renderIneligibleDialog = () => {
    if (!elements.ineligibleList || !elements.ineligibleDetail) {
      return;
    }

    const ineligibleHouseholds = Array.isArray(state.dashboard.ineligibleHouseholds)
      ? state.dashboard.ineligibleHouseholds
      : [];
    if (!ineligibleHouseholds.length) {
      elements.ineligibleList.innerHTML = `<div class="admin-placeholder">No ineligible households found.</div>`;
      elements.ineligibleDetail.textContent = "No ineligible households found.";
      return;
    }

    elements.ineligibleList.innerHTML = ineligibleHouseholds.map((household, index) => `
      <button type="button" class="admin-list-button${index === 0 ? " is-active" : ""}" data-admin-ineligible-household="${escapeHtml(household.householdId)}">
        <strong>${escapeHtml(household.householdId)}</strong>
        <span>${escapeHtml(household.headName || household.location || "-")}</span>
      </button>
    `).join("");

    const updateDetail = (householdId) => {
      const household = ineligibleHouseholds.find((item) => item.householdId === householdId) || ineligibleHouseholds[0];
      elements.ineligibleDetail.textContent = household?.ineligibleReason || "Eligibility criteria not met.";
      elements.ineligibleList.querySelectorAll("[data-admin-ineligible-household]").forEach((button) => {
        button.classList.toggle("is-active", button.getAttribute("data-admin-ineligible-household") === household?.householdId);
      });
    };

    elements.ineligibleList.querySelectorAll("[data-admin-ineligible-household]").forEach((button) => {
      button.addEventListener("click", () => {
        updateDetail(button.getAttribute("data-admin-ineligible-household") || "");
      });
    });

    updateDetail(ineligibleHouseholds[0].householdId);
  };

  const renderAll = () => {
    renderSummaryCards(elements.summaryCards, state.dashboard.summary);
    const filteredHouseholds = getFilteredHouseholds();
    renderHouseholdTable(elements.householdTableBody, filteredHouseholds, (householdId) => {
      window.location.hash = "#household-details";
      if (elements.detailsSelect) {
        elements.detailsSelect.value = householdId;
      }
      renderDetailsPanel(elements.detailsPanel, getSelectedHousehold());
      updateActivePage();
    });
    renderDetailsSelector();
    renderDetailsPanel(elements.detailsPanel, getSelectedHousehold());
    renderIneligibleDialog();
    renderAdminUsers(elements.usersTableBody, state.users);
    renderSyncMonitoring(elements.syncSummary, elements.syncTableBody, elements.syncPlaceholder, state.syncMonitoring);
    renderDuplicates(elements.duplicatesTableBody, elements.duplicatesPlaceholder, state.duplicates);
    renderHealth(elements.healthSummary, state.health);
  };

  const setFeedback = (message, isError = false) => {
    if (!elements.feedback) {
      return;
    }
    elements.feedback.textContent = message || "";
    elements.feedback.classList.toggle("admin-feedback--error", Boolean(isError));
  };

  const setExportFeedback = (message, isError = false) => {
    if (!elements.exportFeedback) {
      setFeedback(message, isError);
      return;
    }
    elements.exportFeedback.textContent = message || "";
    elements.exportFeedback.classList.toggle("admin-feedback--error", Boolean(isError));
  };

  const updateActivePage = () => {
    const requestedPageId = (window.location.hash || "#overview").replace("#", "") || "overview";
    const pageId = pageTitles[requestedPageId] ? requestedPageId : "overview";
    elements.pages.forEach((page) => {
      const isActive = page.id === pageId;
      page.hidden = !isActive;
      page.classList.toggle("is-active", isActive);
    });
    elements.navLinks.forEach((link) => {
      const isActive = (link.getAttribute("href") || "").replace("#", "") === pageId;
      link.classList.toggle("is-active", isActive);
    });
    if (elements.title) {
      elements.title.textContent = pageTitles[pageId] || "Overview";
    }
  };

  const loadDashboardData = async () => {
    const [dashboard, users, syncMonitoring, duplicates, health] = await Promise.all([
      apiJsonRequest(`/api/admin/dashboard?t=${Date.now()}`, { cache: "no-store" }),
      apiJsonRequest(`/api/admin/users?t=${Date.now()}`, { cache: "no-store" }),
      apiJsonRequest(`/api/admin/sync-monitoring?t=${Date.now()}`, { cache: "no-store" }),
      apiJsonRequest(`/api/admin/duplicates?t=${Date.now()}`, { cache: "no-store" }),
      apiJsonRequest(`/api/admin/health?t=${Date.now()}`, { cache: "no-store" }),
    ]);

    state.dashboard = dashboard || { summary: {}, households: [], ineligibleHouseholds: [] };
    state.users = users?.users || [];
    state.syncMonitoring = syncMonitoring;
    state.duplicates = duplicates;
    state.health = health;
    renderAll();
  };

  if (elements.name) {
    elements.name.textContent = session.name || "Management User";
  }
  if (elements.email) {
    elements.email.textContent = session.email || MANAGEMENT_EMAIL;
  }

  const refreshAll = async () => {
    if (elements.refreshButton) {
      elements.refreshButton.disabled = true;
    }
    setFeedback("Loading dashboard data...");
    try {
      await loadDashboardData();
      setFeedback(`Loaded ${state.dashboard.households.length} household${state.dashboard.households.length === 1 ? "" : "s"} from the backend.`);
    } catch (error) {
      state.dashboard = { summary: {}, households: [], ineligibleHouseholds: [] };
      state.users = [];
      state.syncMonitoring = null;
      state.duplicates = null;
      state.health = null;
      renderAll();
      setFeedback(error?.message || "Unable to load dashboard data.", true);
    } finally {
      if (elements.refreshButton) {
        elements.refreshButton.disabled = false;
      }
    }
  };

  const rerenderFilteredView = () => {
    const selectedHouseholdId = elements.detailsSelect?.value || "";
    renderDetailsSelector();
    if (elements.detailsSelect && selectedHouseholdId) {
      const stillVisible = getFilteredHouseholds().some((item) => item.householdId === selectedHouseholdId);
      elements.detailsSelect.value = stillVisible ? selectedHouseholdId : "";
    }
    renderAll();
  };

  elements.filterLocation?.addEventListener("change", rerenderFilteredView);
  elements.filterStartDate?.addEventListener("change", rerenderFilteredView);
  elements.filterEndDate?.addEventListener("change", rerenderFilteredView);
  elements.detailsSelect?.addEventListener("change", () => {
    renderDetailsPanel(elements.detailsPanel, getSelectedHousehold());
  });
  elements.refreshButton?.addEventListener("click", () => {
    void refreshAll();
  });
  elements.refreshHealthButton?.addEventListener("click", async () => {
    try {
      state.health = await apiJsonRequest(`/api/admin/health?t=${Date.now()}`, { cache: "no-store" });
      renderHealth(elements.healthSummary, state.health);
      setFeedback("System health refreshed.");
    } catch (error) {
      setFeedback(error?.message || "Unable to refresh system health.", true);
    }
  });
  elements.logoutButton?.addEventListener("click", () => {
    sessionStorage.removeItem(AUTH_KEY);
    window.location.href = "index.html";
  });

  const getExportQueryString = () => {
    const params = new URLSearchParams();
    if (elements.exportStartDate?.value) {
      params.set("startDate", elements.exportStartDate.value);
    }
    if (elements.exportEndDate?.value) {
      params.set("endDate", elements.exportEndDate.value);
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  };

  const bindBackendExport = (button, path, fallbackFilename, label) => {
    button?.addEventListener("click", async () => {
      button.disabled = true;
      setExportFeedback(`${label} download is starting...`);
      try {
        const filename = await apiDownloadRequest(`${path}${getExportQueryString()}`, fallbackFilename);
        setExportFeedback(`${label} downloaded as ${filename}.`);
      } catch (error) {
        if (error?.status === 401) {
          setExportFeedback("Your admin session has expired. Please log in again to export data.", true);
          sessionStorage.removeItem(AUTH_KEY);
        } else {
          setExportFeedback(error?.message || `Unable to download ${label}.`, true);
        }
      } finally {
        button.disabled = false;
      }
    });
  };

  bindBackendExport(elements.exportSeafCsv, "/api/admin/export/seaf", "seaf_export.csv", "SEAF CSV");
  bindBackendExport(elements.exportEngineeringCsv, "/api/admin/export/engineering", "engineering_export.csv", "Engineering CSV");
  bindBackendExport(elements.exportInventoryCsv, "/api/admin/export/inventory", "inventory_export.csv", "Inventory CSV");
  bindBackendExport(
    elements.exportCombinedCsv,
    "/api/admin/export/combined",
    "combined_assessment_export.csv",
    "Combined Assessment CSV"
  );
  bindBackendExport(
    elements.exportFailedCombinedCsv,
    "/api/admin/export/combined/failed",
    "failed_rejected_assessment_export.csv",
    "Failed/Rejected Assessment CSV"
  );

  elements.summaryCards?.addEventListener("click", (event) => {
    if (!event.target.closest("[data-admin-open-ineligible-dialog]") || !elements.ineligibleDialog) {
      return;
    }
    renderIneligibleDialog();
    elements.ineligibleDialog.showModal();
  });
  elements.ineligibleClose?.addEventListener("click", () => {
    elements.ineligibleDialog?.close();
  });
  elements.ineligibleDialog?.addEventListener("click", (event) => {
    if (event.target === elements.ineligibleDialog) {
      elements.ineligibleDialog.close();
    }
  });

  window.addEventListener("hashchange", updateActivePage);
  updateActivePage();
  await refreshAll();
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector("[data-admin-login-form]")) {
    bootLoginPage();
  }

  if (document.querySelector("[data-admin-page-title]")) {
    void bootDashboardPage();
  }
});

