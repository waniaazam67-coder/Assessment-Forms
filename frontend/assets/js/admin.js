const AUTH_KEY = "shehersaaz-admin-dashboard-auth";
const ADMIN_EMAIL = "admin@shehersaaz.com";
const ADMIN_PASSWORD = "Admin@2025";

const generatedIdsStorageKey = "shehersaaz-generated-household-ids";
const eligibleHouseholdsStorageKey = "shehersaaz-eligible-households";
const submittedFormsStorageKey = "shehersaaz-submitted-forms";
const seafResponsesStorageKey = "shehersaaz-seaf-responses";
const householdRecordsStorageKey = "shehersaaz-household-records";
const isLocalFrontendDev = ["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port === "5173";
const backendBaseUrl = window.location.protocol === "file:" || isLocalFrontendDev ? "http://127.0.0.1:4000" : window.location.origin;

function readJson(storage, key, fallback) {
  try {
    const value = storage.getItem(key);
    if (!value) {
      return fallback;
    }

    const parsed = JSON.parse(value);
    return parsed || fallback;
  } catch (error) {
    return fallback;
  }
}

async function apiJsonRequest(path) {
  const requestOptions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  const headers = {
    Accept: "application/json",
    ...(requestOptions.headers || {}),
  };

  const response = await fetch(`${backendBaseUrl}${path}`, {
    ...requestOptions,
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
      // Ignore JSON parse failures and keep the default message.
    }

    const requestError = new Error(message);
    requestError.status = response.status;
    throw requestError;
  }

  return response.json();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function formatDate(value, options = {}) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    ...options,
  }).format(date);
}

function formatDateTime(value) {
  if (!value) {
    return "Not available";
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

function sortRecords(records) {
  return [...records].sort((left, right) => {
    if (left.surveyDate && right.surveyDate && left.surveyDate !== right.surveyDate) {
      return String(right.surveyDate).localeCompare(String(left.surveyDate));
    }

    return String(right.householdId || "").localeCompare(String(left.householdId || ""));
  });
}

function buildRecordsFromSnapshot(snapshot = {}) {
  const households = Array.isArray(snapshot.households) ? snapshot.households : [];
  const submittedForms = snapshot.submittedForms && typeof snapshot.submittedForms === "object" ? snapshot.submittedForms : {};
  const seafResponses = snapshot.seafResponses && typeof snapshot.seafResponses === "object" ? snapshot.seafResponses : {};
  const generatedIds = Array.isArray(snapshot.generatedIds) ? snapshot.generatedIds : [];
  const map = new Map();

  households.forEach((record) => {
    if (!record?.householdId) {
      return;
    }

    const submission = submittedForms[record.householdId] || {};
    map.set(record.householdId, {
      householdId: record.householdId,
      headName: record.headName || submission.headName || "-",
      surveyDate: record.surveyDate || "",
      city: record.city || "",
      ucnc: record.ucnc || "",
      address: record.address || "",
      catchmentArea: record.catchmentArea || "",
      tankSpace: record.tankSpace || "",
      cmoName: record.cmoName || record.enumeratorName || "",
      engineerName: record.engineerName || "",
      engineerEmploymentCode: record.engineerEmploymentCode || "",
      eligibilityStatus: record.eligibilityStatus || record.status || "",
      updatedAt: record.updatedAt || submission.updatedAt || null,
      status: {
        household: submission.household || "Pending",
        seaf: submission.seaf || (record.stageStatus?.seaf ? "Submitted" : "Pending"),
        engineering: submission.engineering || (record.stageStatus?.engineering ? "Submitted" : "Pending"),
        inventory: submission.inventory || (record.stageStatus?.inventory ? "Submitted" : "Pending"),
      },
      stageStatus: {
        seaf: Boolean(record.stageStatus?.seaf || submission.seaf === "Submitted"),
        engineering: Boolean(record.stageStatus?.engineering || submission.engineering === "Submitted"),
        inventory: Boolean(record.stageStatus?.inventory || submission.inventory === "Submitted"),
      },
    });
  });

  Object.entries(submittedForms).forEach(([householdId, record]) => {
    if (!householdId) {
      return;
    }

    const existing = map.get(householdId) || { householdId };
    map.set(householdId, {
      ...existing,
      householdId,
      headName: existing.headName || record.headName || "-",
      eligibilityStatus: existing.eligibilityStatus || "",
      updatedAt: existing.updatedAt || record.updatedAt || null,
      status: {
        household: record.household || existing.status?.household || "Pending",
        seaf: record.seaf || existing.status?.seaf || "Pending",
        engineering: record.engineering || existing.status?.engineering || "Pending",
        inventory: record.inventory || existing.status?.inventory || "Pending",
      },
      stageStatus: {
        seaf: Boolean(existing.stageStatus?.seaf || record.seaf === "Submitted"),
        engineering: Boolean(existing.stageStatus?.engineering || record.engineering === "Submitted"),
        inventory: Boolean(existing.stageStatus?.inventory || record.inventory === "Submitted"),
      },
    });
  });

  Object.keys(seafResponses).forEach((householdId) => {
    if (!map.has(householdId)) {
      map.set(householdId, {
        householdId,
        headName: "-",
        surveyDate: "",
        city: "",
        ucnc: "",
        address: "",
        catchmentArea: "",
        tankSpace: "",
        cmoName: "",
        engineerName: "",
        engineerEmploymentCode: "",
        eligibilityStatus: "",
        updatedAt: seafResponses[householdId]?.submittedAt || null,
        status: {
          household: "Pending",
          seaf: "Submitted",
          engineering: "Pending",
          inventory: "Pending",
        },
        stageStatus: {
          seaf: true,
          engineering: false,
          inventory: false,
        },
      });
    }
  });

  generatedIds.forEach((householdId) => {
    if (typeof householdId !== "string" || !householdId.trim() || map.has(householdId)) {
      return;
    }

    map.set(householdId, {
      householdId,
      headName: "-",
      surveyDate: "",
      city: "",
      ucnc: "",
      address: "",
      catchmentArea: "",
      tankSpace: "",
      cmoName: "",
      engineerName: "",
      engineerEmploymentCode: "",
      eligibilityStatus: "",
      updatedAt: null,
      status: {
        household: "Pending",
        seaf: "Pending",
        engineering: "Pending",
        inventory: "Pending",
      },
      stageStatus: {
        seaf: false,
        engineering: false,
        inventory: false,
      },
    });
  });

  return sortRecords(Array.from(map.values()));
}

function buildRecordsFromLocalStorage() {
  const storedRecords = readJson(localStorage, householdRecordsStorageKey, []);
  const generatedIds = readJson(localStorage, generatedIdsStorageKey, []);
  const eligible = readJson(localStorage, eligibleHouseholdsStorageKey, []);
  const submitted = readJson(localStorage, submittedFormsStorageKey, {});
  const seafResponses = readJson(localStorage, seafResponsesStorageKey, {});
  const eligibleIds = new Set(
    eligible
      .map((household) => household?.householdId)
      .filter((householdId) => typeof householdId === "string" && householdId.trim())
  );

  const map = new Map();

  storedRecords.forEach((record) => {
    if (!record?.householdId) {
      return;
    }

    const submission = submitted[record.householdId] || {};
    map.set(record.householdId, {
      householdId: record.householdId,
      headName: record.headName || submission.headName || "-",
      surveyDate: record.surveyDate || "",
      city: record.city || "",
      ucnc: record.ucnc || "",
      address: record.address || "",
      catchmentArea: record.catchmentArea || "",
      tankSpace: record.tankSpace || "",
      cmoName: record.cmoName || record.enumeratorName || "",
      engineerName: record.engineerName || "",
      engineerEmploymentCode: record.engineerEmploymentCode || "",
      eligibilityStatus: record.status || record.eligibilityStatus || (eligibleIds.has(record.householdId) ? "passed" : "failed"),
      updatedAt: record.updatedAt || submission.updatedAt || null,
      status: {
        household: submission.household || "Pending",
        seaf: submission.seaf || "Pending",
        engineering: submission.engineering || "Pending",
        inventory: submission.inventory || "Pending",
      },
      stageStatus: {
        seaf: Boolean(record.stageStatus?.seaf || submission.seaf === "Submitted"),
        engineering: Boolean(record.stageStatus?.engineering || submission.engineering === "Submitted"),
        inventory: Boolean(record.stageStatus?.inventory || submission.inventory === "Submitted"),
      },
    });
  });

  eligible.forEach((household) => {
    if (!household?.householdId) {
      return;
    }

    const existing = map.get(household.householdId) || { householdId: household.householdId };
    map.set(household.householdId, {
      ...existing,
      householdId: household.householdId,
      headName: existing.headName || household.headName || "-",
      eligibilityStatus: existing.eligibilityStatus || "passed",
    });
  });

  Object.entries(submitted).forEach(([householdId, record]) => {
    if (!householdId) {
      return;
    }

    const existing = map.get(householdId) || { householdId };
    map.set(householdId, {
      ...existing,
      householdId,
      headName: existing.headName || record.headName || "-",
      engineerName: existing.engineerName || record.engineerName || "",
      updatedAt: existing.updatedAt || record.updatedAt || null,
      status: {
        household: record.household || existing.status?.household || "Pending",
        seaf: record.seaf || existing.status?.seaf || "Pending",
        engineering: record.engineering || existing.status?.engineering || "Pending",
        inventory: record.inventory || existing.status?.inventory || "Pending",
      },
      stageStatus: {
        seaf: Boolean(existing.stageStatus?.seaf || record.seaf === "Submitted"),
        engineering: Boolean(existing.stageStatus?.engineering || record.engineering === "Submitted"),
        inventory: Boolean(existing.stageStatus?.inventory || record.inventory === "Submitted"),
      },
    });
  });

  Object.keys(seafResponses).forEach((householdId) => {
    if (!map.has(householdId)) {
      map.set(householdId, {
        householdId,
        headName: "-",
        surveyDate: "",
        city: "",
        ucnc: "",
        address: "",
        catchmentArea: "",
        tankSpace: "",
        cmoName: "",
        engineerName: "",
        engineerEmploymentCode: "",
        eligibilityStatus: eligibleIds.has(householdId) ? "passed" : "failed",
        updatedAt: seafResponses[householdId]?.submittedAt || null,
        status: {
          household: "Pending",
          seaf: "Submitted",
          engineering: "Pending",
          inventory: "Pending",
        },
        stageStatus: {
          seaf: true,
          engineering: false,
          inventory: false,
        },
      });
    }
  });

  generatedIds.forEach((householdId) => {
    if (typeof householdId !== "string" || !householdId.trim() || map.has(householdId)) {
      return;
    }

    map.set(householdId, {
      householdId,
      headName: "-",
      surveyDate: "",
      city: "",
      ucnc: "",
      address: "",
      catchmentArea: "",
      tankSpace: "",
      cmoName: "",
      engineerName: "",
      engineerEmploymentCode: "",
      eligibilityStatus: eligibleIds.has(householdId) ? "passed" : "failed",
      updatedAt: submitted[householdId]?.updatedAt || null,
      status: {
        household: submitted[householdId]?.household || "Pending",
        seaf: submitted[householdId]?.seaf || "Pending",
        engineering: submitted[householdId]?.engineering || "Pending",
        inventory: submitted[householdId]?.inventory || "Pending",
      },
      stageStatus: {
        seaf: Boolean(submitted[householdId]?.seaf === "Submitted"),
        engineering: Boolean(submitted[householdId]?.engineering === "Submitted"),
        inventory: Boolean(submitted[householdId]?.inventory === "Submitted"),
      },
    });
  });

  return sortRecords(Array.from(map.values()));
}

function getOverviewStats(records) {
  const totalAssessed = records.length;
  const eligibleCount = records.filter((record) => normalizeStatus(record?.eligibilityStatus) === "passed").length;
  const notEligibleCount = records.filter((record) => normalizeStatus(record?.eligibilityStatus) === "failed").length;
  const seafDone = records.filter((record) => record?.stageStatus?.seaf).length;
  const engineeringDone = records.filter((record) => record?.stageStatus?.engineering).length;
  const readyCount = records.filter((record) => record?.stageStatus?.seaf && record?.stageStatus?.engineering && record?.stageStatus?.inventory).length;

  return [
    {
      label: "Total households assessed",
      value: totalAssessed,
      icon: "households",
      tone: "mint",
    },
    {
      label: "Eligible / Passed households",
      value: eligibleCount,
      icon: "eligible",
      tone: "sky",
    },
    {
      label: "Not eligible",
      value: notEligibleCount,
      icon: "rejected",
      tone: "rose",
    },
    {
      label: "Socioeconomic assessment done",
      value: seafDone,
      icon: "seaf",
      tone: "gold",
    },
    {
      label: "Engineering assessment done",
      value: engineeringDone,
      icon: "engineering",
      tone: "peach",
    },
    {
      label: "Ready for RWHU installation",
      value: readyCount,
      icon: "ready",
      tone: "mint",
    },
  ];
}

function countSubmitted(record) {
  const status = record.status || {};
  const seaf = record.stageStatus?.seaf || status.seaf === "Submitted";
  const engineering = record.stageStatus?.engineering || status.engineering === "Submitted";
  const inventory = record.stageStatus?.inventory || status.inventory === "Submitted";

  return {
    seaf,
    engineering,
    inventory,
    complete: seaf && engineering && inventory,
  };
}

function metricIcon(kind) {
  const icons = {
    households: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 10.5 12 4l9 6.5" />
        <path d="M5 9.5V20h14V9.5" />
        <path d="M9 20v-6h6v6" />
      </svg>
    `,
    eligible: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2l3 6 6 .9-4.5 4.4 1.1 6.4L12 16.8 6.4 19.7l1.1-6.4L3 8.9 9 8z" />
      </svg>
    `,
    rejected: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6" />
        <path d="m15 9-6 6" />
      </svg>
    `,
    seaf: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 4h10v16H7z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </svg>
    `,
    engineering: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.5 4.5a4 4 0 0 1 5 5L10 19l-5 1 1-5 9.5-10.5Z" />
        <path d="m13 6 5 5" />
      </svg>
    `,
    ready: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 12.5 9 18 20 7" />
        <path d="M12 3a9 9 0 1 1-9 9" />
      </svg>
    `,
  };

  return icons[kind] || icons.households;
}

function getChipTone(value) {
  const normalized = normalizeStatus(value);

  if (["submitted", "passed", "connected", "healthy", "complete"].includes(normalized)) {
    return "done";
  }

  if (["failed", "disconnected", "offline", "error"].includes(normalized)) {
    return "failed";
  }

  return "pending";
}

function renderMetrics(container, records) {
  if (!container) {
    return;
  }

  container.innerHTML = "";
  getOverviewStats(records).forEach((metric) => {
    const item = document.createElement("article");
    item.className = `admin-metric admin-metric--${metric.tone || "mint"}`;
    item.innerHTML = `
      <div class="admin-metric__icon">${metricIcon(metric.icon)}</div>
      <div class="admin-metric__body">
        <p class="admin-muted">${metric.label}</p>
        <h3>${metric.value}</h3>
      </div>
    `;
    container.append(item);
  });
}

function renderDataTable(container, records, filters = {}) {
  if (!container) {
    return;
  }

  const locationTerm = normalizeStatus(filters.location);
  const statusTerm = normalizeStatus(filters.status);
  const nameTerm = normalizeStatus(filters.name);
  const stageTerm = normalizeStatus(filters.stage);
  const startDate = normalizeStatus(filters.startDate);
  const endDate = normalizeStatus(filters.endDate);

  const filtered = records.filter((record) => {
    const location = `${record.city || ""} ${record.ucnc || ""} ${record.address || ""}`.toLowerCase();
    const names = `${record.cmoName || ""} ${record.engineerName || ""}`.toLowerCase();
    const recordStatus = normalizeStatus(record.eligibilityStatus);
    const recordDate = normalizeStatus(record.surveyDate);
    const stageStatus = record.stageStatus || {};

    const matchesLocation = !locationTerm || location.includes(locationTerm);
    const matchesStatus = !statusTerm || recordStatus === statusTerm;
    const matchesName = !nameTerm || names.includes(nameTerm);
    const matchesStart = !startDate || !recordDate || recordDate >= startDate;
    const matchesEnd = !endDate || !recordDate || recordDate <= endDate;
    const matchesStage =
      !stageTerm ||
      (stageTerm === "seaf" && stageStatus.seaf) ||
      (stageTerm === "engineering" && stageStatus.engineering) ||
      (stageTerm === "inventory" && stageStatus.inventory);

    return matchesLocation && matchesStatus && matchesName && matchesStart && matchesEnd && matchesStage;
  });

  container.innerHTML = "";

  if (filtered.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="5" class="admin-table__empty">No households match the selected filters.</td>`;
    container.append(row);
    return;
  }

  filtered.forEach((record) => {
    const row = document.createElement("tr");
    const location = [record.city, record.ucnc, record.address].filter(Boolean).join(", ") || "-";
    const isPassed = normalizeStatus(record.eligibilityStatus) === "passed";
    const statusLabel = isPassed ? "Passed" : "Failed";
    const staffLabel = record.cmoName || record.engineerName ? [record.cmoName, record.engineerName].filter(Boolean).join(" / ") : "No staff captured";

    row.innerHTML = `
      <td>${escapeHtml(record.householdId || "-")}</td>
      <td>
        <strong class="admin-table__primary">${escapeHtml(location)}</strong>
        <small class="admin-table__meta">${escapeHtml(staffLabel)}</small>
      </td>
      <td>${escapeHtml(record.catchmentArea || "-")}</td>
      <td>${escapeHtml(record.tankSpace || "-")}</td>
      <td><span class="admin-chip admin-chip--${isPassed ? "green" : "failed"}">${statusLabel}</span></td>
    `;
    container.append(row);
  });
}

function renderHouseholdSummary(container, records) {
  if (!container) {
    return;
  }

  const completed = records.filter((record) => countSubmitted(record).complete).length;
  const pending = records.filter((record) => !countSubmitted(record).complete).length;
  const withCatchment = records.filter((record) => String(record.catchmentArea || "").trim()).length;
  const withTankSpace = records.filter((record) => String(record.tankSpace || "").trim()).length;

  const items = [
    { label: "Households in database", value: records.length },
    { label: "All three forms submitted", value: completed },
    { label: "Need follow-up", value: pending },
    { label: "Catchment captured", value: withCatchment },
    { label: "Tank space captured", value: withTankSpace },
  ];

  container.innerHTML = items
    .map(
      (item) => `
        <article class="admin-summary-card">
          <strong>${escapeHtml(item.value)}</strong>
          <span>${escapeHtml(item.label)}</span>
        </article>
      `
    )
    .join("");
}

function renderHouseholdList(container, records, searchTerm = "") {
  if (!container) {
    return;
  }

  const normalizedSearch = normalizeStatus(searchTerm);
  const filtered = records.filter((record) => {
    if (!normalizedSearch) {
      return true;
    }

    const haystack = [
      record.householdId,
      record.headName,
      record.city,
      record.ucnc,
      record.address,
      record.cmoName,
      record.engineerName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="admin-placeholder">No household records match that search.</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((record) => {
      const summary = countSubmitted(record);
      const location = [record.city, record.ucnc, record.address].filter(Boolean).join(", ") || "Location not captured yet";
      const eligibility = normalizeStatus(record.eligibilityStatus) === "passed" ? "Passed" : normalizeStatus(record.eligibilityStatus) === "failed" ? "Failed" : "Pending";
      const updatedAt = record.updatedAt ? formatDateTime(record.updatedAt) : "No recent backend update";

      return `
        <article class="admin-household-card">
          <div class="admin-household-card__header">
            <div>
              <h4>${escapeHtml(record.headName || "-")}</h4>
              <p>${escapeHtml(record.householdId || "-")}</p>
            </div>
            <span class="admin-chip admin-chip--${getChipTone(eligibility)}">${escapeHtml(eligibility)}</span>
          </div>
          <p class="admin-household-card__location">${escapeHtml(location)}</p>
          <div class="admin-household-card__meta">
            <span>Survey date: ${escapeHtml(formatDate(record.surveyDate))}</span>
            <span>Catchment: ${escapeHtml(record.catchmentArea || "-")}</span>
            <span>Tank space: ${escapeHtml(record.tankSpace || "-")}</span>
            <span>Updated: ${escapeHtml(updatedAt)}</span>
          </div>
          <div class="admin-household-card__staff">
            <span>CMO: ${escapeHtml(record.cmoName || "Not captured")}</span>
            <span>Engineer: ${escapeHtml(record.engineerName || "Not captured")}</span>
          </div>
          <div class="admin-household-card__stages">
            <span class="admin-chip admin-chip--${getChipTone(record.status?.household)}">Household: ${escapeHtml(record.status?.household || "Pending")}</span>
            <span class="admin-chip admin-chip--${getChipTone(summary.seaf ? "Submitted" : "Pending")}">SEAF: ${summary.seaf ? "Submitted" : "Pending"}</span>
            <span class="admin-chip admin-chip--${getChipTone(summary.engineering ? "Submitted" : "Pending")}">Engineering: ${summary.engineering ? "Submitted" : "Pending"}</span>
            <span class="admin-chip admin-chip--${getChipTone(summary.inventory ? "Submitted" : "Pending")}">Inventory: ${summary.inventory ? "Submitted" : "Pending"}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function buildRecentActivity(snapshot = {}) {
  const formSubmissions = snapshot.formSubmissions && typeof snapshot.formSubmissions === "object" ? snapshot.formSubmissions : {};
  const items = [];

  Object.entries(formSubmissions).forEach(([householdId, forms]) => {
    Object.entries(forms || {}).forEach(([formKey, entry]) => {
      items.push({
        householdId,
        formKey,
        submittedAt: entry?.submittedAt || null,
      });
    });
  });

  return items
    .sort((left, right) => String(right.submittedAt || "").localeCompare(String(left.submittedAt || "")))
    .slice(0, 10);
}

function renderSystemStatus(container, records, snapshot, health, usingBackend) {
  if (!container) {
    return;
  }

  const recentActivityCount = buildRecentActivity(snapshot).length;
  const items = [
    {
      label: "Backend status",
      value: usingBackend ? "Connected" : "Disconnected",
    },
    {
      label: "Database health",
      value: health?.ok ? "Healthy" : usingBackend ? "Unavailable" : "Offline",
    },
    {
      label: "Last snapshot sync",
      value: usingBackend ? formatDateTime(snapshot?.updatedAt) : "Not available",
    },
    {
      label: "Households loaded",
      value: String(records.length),
    },
    {
      label: "Generated household IDs",
      value: String(Array.isArray(snapshot?.generatedIds) ? snapshot.generatedIds.length : 0),
    },
    {
      label: "Recent submitted forms shown",
      value: String(recentActivityCount),
    },
  ];

  container.innerHTML = items
    .map(
      (item) => `
        <article class="admin-role-item">
          <strong>${escapeHtml(item.label)}</strong>
          <span class="admin-chip admin-chip--${getChipTone(item.value)}">${escapeHtml(item.value)}</span>
        </article>
      `
    )
    .join("");
}

function renderRecentActivity(container, snapshot = {}) {
  if (!container) {
    return;
  }

  const activity = buildRecentActivity(snapshot);
  if (activity.length === 0) {
    container.innerHTML = `<div class="admin-placeholder">No form submissions have reached the database yet.</div>`;
    return;
  }

  container.innerHTML = activity
    .map(
      (item) => `
        <article class="admin-activity-item">
          <strong>${escapeHtml(item.householdId)}</strong>
          <small>${escapeHtml(item.formKey.toUpperCase())} form submission</small>
          <span>${escapeHtml(formatDateTime(item.submittedAt))}</span>
        </article>
      `
    )
    .join("");
}

function bootLoginPage() {
  const form = document.querySelector("[data-admin-login-form]");
  const feedback = document.querySelector("[data-admin-feedback]");
  const submitButton = form?.querySelector('button[type="submit"]');

  const existing = sessionStorage.getItem(AUTH_KEY);
  if (existing) {
    window.location.href = "dashboard.html";
    return;
  }

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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      sessionStorage.setItem(
        AUTH_KEY,
        JSON.stringify({
          email: result?.session?.email || email || ADMIN_EMAIL,
          name: result?.session?.name || "Admin",
        })
      );
      window.location.href = "dashboard.html";
    } catch (error) {
      if (feedback) {
        feedback.textContent =
          error?.status === 401
            ? "Invalid admin credentials."
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

function triggerExport(dataset, format) {
  const link = document.createElement("a");
  link.href = `${backendBaseUrl}/api/export?dataset=${encodeURIComponent(dataset)}&format=${encodeURIComponent(format)}`;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

async function bootDashboardPage() {
  const session = readJson(sessionStorage, AUTH_KEY, null);
  if (!session) {
    window.location.href = "index.html";
    return;
  }

  const name = document.querySelector("[data-admin-user-name]");
  const email = document.querySelector("[data-admin-user-email]");
  const metrics = document.querySelector("[data-admin-metrics]");
  const pages = Array.from(document.querySelectorAll("[data-admin-page]"));
  const navLinks = Array.from(document.querySelectorAll(".admin-nav__link"));
  const tableBody = document.querySelector("[data-admin-data-table-body]");
  const dataSource = document.querySelector("[data-admin-data-source]");
  const refreshButton = document.querySelector("[data-admin-refresh]");
  const exportCsvButton = document.querySelector("[data-admin-export-csv]");
  const exportJsonButton = document.querySelector("[data-admin-export-json]");
  const exportSeafButton = document.querySelector("[data-admin-export-seaf]");
  const exportEngineeringButton = document.querySelector("[data-admin-export-engineering]");
  const exportInventoryButton = document.querySelector("[data-admin-export-inventory]");
  const householdSummary = document.querySelector("[data-admin-household-summary]");
  const householdList = document.querySelector("[data-admin-household-list]");
  const householdSearch = document.querySelector("[data-admin-household-search]");
  const systemStatus = document.querySelector("[data-admin-system-status]");
  const recentActivity = document.querySelector("[data-admin-activity-list]");
  const filters = {
    location: document.querySelector("[data-admin-filter-location]"),
    status: document.querySelector("[data-admin-filter-status]"),
    name: document.querySelector("[data-admin-filter-name]"),
    startDate: document.querySelector("[data-admin-filter-start-date]"),
    endDate: document.querySelector("[data-admin-filter-end-date]"),
    stage: document.querySelector("[data-admin-filter-stage]"),
  };
  const logout = document.querySelector("[data-admin-logout]");

  let records = [];
  let snapshot = {};
  let health = null;
  let usingBackend = false;

  if (name) {
    name.textContent = session.name || "Admin";
  }
  if (email) {
    email.textContent = session.email || ADMIN_EMAIL;
  }

  const setActivePage = (pageId) => {
    const normalized = pageId || "overview";

    pages.forEach((page) => {
      const isActive = page.id === normalized;
      page.hidden = !isActive;
      page.classList.toggle("is-active", isActive);
    });

    navLinks.forEach((link) => {
      const linkHash = (link.getAttribute("href") || "").replace("#", "");
      link.classList.toggle("is-active", linkHash === normalized);
    });
  };

  const renderTable = () => {
    renderDataTable(tableBody, records, {
      location: filters.location?.value || "",
      status: filters.status?.value || "",
      name: filters.name?.value || "",
      startDate: filters.startDate?.value || "",
      endDate: filters.endDate?.value || "",
      stage: filters.stage?.value || "",
    });
  };

  const renderHouseholds = () => {
    renderHouseholdSummary(householdSummary, records);
    renderHouseholdList(householdList, records, householdSearch?.value || "");
  };

  const renderAccess = () => {
    renderSystemStatus(systemStatus, records, snapshot, health, usingBackend);
    renderRecentActivity(recentActivity, snapshot);
  };

  const loadRecords = async () => {
    if (dataSource) {
      dataSource.textContent = "Loading latest records...";
    }

    try {
      const [nextHealth, nextSnapshot] = await Promise.all([
        apiJsonRequest("/api/health"),
        apiJsonRequest("/api/db"),
      ]);

      health = nextHealth;
      snapshot = nextSnapshot;
      records = buildRecordsFromSnapshot(nextSnapshot);
      usingBackend = true;

      if (dataSource) {
        dataSource.textContent = "Connected to Node.js + MySQL. All dashboard sections are using live database data.";
      }
    } catch (error) {
      health = null;
      snapshot = {};
      records = buildRecordsFromLocalStorage();
      usingBackend = false;

      if (dataSource) {
        dataSource.textContent = "Backend is unavailable. Dashboard is showing browser-stored fallback data only.";
      }
    }

    renderMetrics(metrics, records);
    renderTable();
    renderHouseholds();
    renderAccess();
  };

  Object.values(filters).forEach((control) => {
    control?.addEventListener("input", renderTable);
    control?.addEventListener("change", renderTable);
  });

  householdSearch?.addEventListener("input", renderHouseholds);

  refreshButton?.addEventListener("click", () => {
    void loadRecords();
  });

  exportCsvButton?.addEventListener("click", () => {
    if (!usingBackend) {
      window.alert("Start the Node.js backend first so the CSV can be downloaded from MySQL.");
      return;
    }

    triggerExport("households", "csv");
  });

  exportJsonButton?.addEventListener("click", () => {
    if (!usingBackend) {
      window.alert("Start the Node.js backend first so the JSON can be downloaded from MySQL.");
      return;
    }

    triggerExport("snapshot", "json");
  });

  exportSeafButton?.addEventListener("click", () => {
    if (!usingBackend) {
      window.alert("Start the Node.js backend first so the SEAF CSV can be downloaded from MySQL.");
      return;
    }

    triggerExport("seaf", "csv");
  });

  exportEngineeringButton?.addEventListener("click", () => {
    if (!usingBackend) {
      window.alert("Start the Node.js backend first so the Engineering CSV can be downloaded from MySQL.");
      return;
    }

    triggerExport("engineering", "csv");
  });

  exportInventoryButton?.addEventListener("click", () => {
    if (!usingBackend) {
      window.alert("Start the Node.js backend first so the Inventory CSV can be downloaded from MySQL.");
      return;
    }

    triggerExport("inventory", "csv");
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = (link.getAttribute("href") || "").replace("#", "");
      if (!target) {
        return;
      }
      event.preventDefault();
      window.location.hash = target;
      setActivePage(target);
    });
  });

  window.addEventListener("hashchange", () => {
    const target = window.location.hash.replace("#", "") || "overview";
    setActivePage(target);
  });

  setActivePage(window.location.hash.replace("#", "") || "overview");
  await loadRecords();

  logout?.addEventListener("click", () => {
    sessionStorage.removeItem(AUTH_KEY);
    window.location.href = "index.html";
  });
}

if (document.querySelector("[data-admin-login-form]")) {
  bootLoginPage();
}

if (document.querySelector("[data-admin-metrics]")) {
  void bootDashboardPage();
}
