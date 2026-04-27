const AUTH_KEY = "shehersaaz-admin-dashboard-auth";
const ADMIN_EMAIL = "admin@shehersaaz.com";
const ADMIN_PASSWORD = "Admin@2025";

const generatedIdsStorageKey = "shehersaaz-generated-household-ids";
const eligibleHouseholdsStorageKey = "shehersaaz-eligible-households";
const submittedFormsStorageKey = "shehersaaz-submitted-forms";
const seafResponsesStorageKey = "shehersaaz-seaf-responses";
const householdRecordsStorageKey = "shehersaaz-household-records";
const isLocalFrontendDev = ["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port === "5173";

const getConfiguredApiBaseUrl = () => {
  const metaTag = document.querySelector('meta[name="api-base-url"]');
  const configuredValue =
    window.__SHEHERSAAZ_API_BASE_URL__ ||
    metaTag?.getAttribute("content") ||
    "";

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

  const hostnameParts = window.location.hostname.split(".").filter(Boolean);
  if (hostnameParts.length > 2) {
    const apexHostname = hostnameParts.slice(1).join(".");
    candidates.push(`${window.location.protocol}//${apexHostname}`);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
};

const backendBaseUrls = getApiBaseUrlCandidates();
const backendBaseUrl = backendBaseUrls[0];

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

  let lastError = null;

  for (const baseUrl of backendBaseUrls) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
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
  const totalSafe = totalAssessed || 1;

  return [
    {
      label: "Total households assessed",
      value: totalAssessed,
      subtext: `+${Math.max(0, totalAssessed - eligibleCount - notEligibleCount)} this week`,
      subtextTone: "positive",
      progress: 100,
      progressTone: "blue",
    },
    {
      label: "Eligible households",
      value: eligibleCount,
      subtext: `${Math.round((eligibleCount / totalSafe) * 100)}% of assessed`,
      progress: Math.round((eligibleCount / totalSafe) * 100),
      progressTone: "green",
    },
    {
      label: "Not eligible",
      value: notEligibleCount,
      subtext: `${Math.round((notEligibleCount / totalSafe) * 100)}% of assessed`,
      progress: Math.round((notEligibleCount / totalSafe) * 100),
      progressTone: "red",
    },
    {
      label: "SEAF done",
      value: seafDone,
      subtext: `${Math.round((seafDone / totalSafe) * 100)}% of assessed`,
      progress: Math.round((seafDone / totalSafe) * 100),
      progressTone: "blue",
    },
    {
      label: "Engineering done",
      value: engineeringDone,
      subtext: `${Math.round((engineeringDone / totalSafe) * 100)}% of assessed`,
      progress: Math.round((engineeringDone / totalSafe) * 100),
      progressTone: "violet",
    },
    {
      label: "Ready for RWHU installation",
      value: readyCount,
      subtext: `${Math.round((readyCount / totalSafe) * 100)}% of assessed`,
      progress: Math.round((readyCount / totalSafe) * 100),
      progressTone: "teal",
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
    item.className = "admin-overview-card admin-metric";
    item.innerHTML = `
      <span class="admin-metric__label">${escapeHtml(metric.label)}</span>
      <strong class="admin-metric__value">${escapeHtml(metric.value)}</strong>
      <span class="admin-metric__subtext${metric.subtextTone === "positive" ? " admin-metric__subtext--positive" : ""}">${escapeHtml(metric.subtext || "")}</span>
    `;
    container.append(item);
  });
}

function renderPipeline(container, records) {
  if (!container) {
    return;
  }

  const stats = getOverviewStats(records);
  const rows = [
    { label: "Total assessed", value: stats[0]?.value || 0, progress: 100, tone: "blue" },
    { label: "Eligible households", value: stats[1]?.value || 0, progress: stats[1]?.progress || 0, tone: "green" },
    { label: "SEAF completed", value: stats[3]?.value || 0, progress: stats[3]?.progress || 0, tone: "blue" },
    { label: "Engineering done", value: stats[4]?.value || 0, progress: stats[4]?.progress || 0, tone: "violet" },
    { label: "Ready for RWHU install", value: stats[5]?.value || 0, progress: stats[5]?.progress || 0, tone: "teal" },
  ];

  container.innerHTML = rows
    .map(
      (row) => `
        <div class="admin-pipeline__row">
          <strong>${escapeHtml(row.label)}</strong>
          <div class="admin-progress" aria-hidden="true">
            <div class="admin-progress__bar admin-progress__bar--${escapeHtml(row.tone)}" style="width: ${Math.max(0, Math.min(100, Number(row.progress) || 0))}%"></div>
          </div>
          <span class="admin-pipeline__value">${escapeHtml(row.value)}</span>
        </div>
      `
    )
    .join("");
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
    const location = [record.city, record.ucnc].filter(Boolean).join(", ") || "-";
    const isPassed = normalizeStatus(record.eligibilityStatus) === "passed";
    const statusLabel = isPassed ? "Eligible" : "Not eligible";
    const headLabel = record.headName || "-";

    row.innerHTML = `
      <td>${escapeHtml(record.householdId || "-")}</td>
      <td>
        <strong class="admin-table__primary">${escapeHtml(headLabel)}</strong>
        <small class="admin-table__meta">${escapeHtml(record.address || "Address not captured")}</small>
      </td>
      <td>${escapeHtml(location)}</td>
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
      const eligibility = normalizeStatus(record.eligibilityStatus) === "passed" ? "Eligible" : normalizeStatus(record.eligibilityStatus) === "failed" ? "Not eligible" : "Pending";
      const readiness = record.stageStatus?.inventory && record.stageStatus?.engineering && record.stageStatus?.seaf ? "Yes" : "No";
      const zone = [record.city, record.ucnc].filter(Boolean).join(", ") || "Area not captured";
      const engineer = record.engineerName || "Not assigned";
      const enumerator = record.cmoName || "Not captured";

      return `
        <article class="admin-household-card">
          <div class="admin-household-card__header">
            <div>
              <h4>${escapeHtml(record.householdId || "-")}</h4>
              <p class="admin-household-card__id">${escapeHtml(record.updatedAt ? `Updated ${formatDate(record.updatedAt)}` : "No recent update")}</p>
            </div>
            <span class="admin-chip admin-chip--${getChipTone(eligibility)}">${escapeHtml(eligibility)}</span>
          </div>
          <div class="admin-household-card__grid">
            <div class="admin-household-card__item">
              <span>Head of household</span>
              <strong>${escapeHtml(record.headName || "Not captured")}</strong>
            </div>
            <div class="admin-household-card__item">
              <span>Area / Zone</span>
              <strong>${escapeHtml(zone)}</strong>
            </div>
            <div class="admin-household-card__item">
              <span>Tank size</span>
              <strong>${escapeHtml(record.tankSpace || "N/A")}</strong>
            </div>
            <div class="admin-household-card__item">
              <span>Enumerator</span>
              <strong>${escapeHtml(enumerator)}</strong>
            </div>
            <div class="admin-household-card__item">
              <span>Engineer</span>
              <strong>${escapeHtml(engineer)}</strong>
            </div>
            <div class="admin-household-card__item">
              <span>RWHU ready</span>
              <strong>${escapeHtml(readiness)}</strong>
            </div>
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
  const pipeline = document.querySelector("[data-admin-pipeline]");
  const pages = Array.from(document.querySelectorAll("[data-admin-page]"));
  const navLinks = Array.from(document.querySelectorAll(".admin-nav__link"));
  const tableBody = document.querySelector("[data-admin-data-table-body]");
  const refreshButton = document.querySelector("[data-admin-refresh]");
  const exportCsvButton = document.querySelector("[data-admin-export-csv]");
  const exportJsonButton = document.querySelector("[data-admin-export-json]");
  const exportSeafButton = document.querySelector("[data-admin-export-seaf]");
  const exportEngineeringButton = document.querySelector("[data-admin-export-engineering]");
  const exportInventoryButton = document.querySelector("[data-admin-export-inventory]");
  const householdSummary = document.querySelector("[data-admin-household-summary]");
  const householdList = document.querySelector("[data-admin-household-list]");
  const householdSearch = document.querySelector("[data-admin-household-search]");
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
    renderHouseholdList(householdList, records, householdSearch?.value || "");
  };

  const loadRecords = async () => {
    try {
      const [nextHealth, nextSnapshot] = await Promise.all([
        apiJsonRequest("/api/health"),
        apiJsonRequest("/api/db"),
      ]);

      health = nextHealth;
      snapshot = nextSnapshot;
      records = buildRecordsFromSnapshot(nextSnapshot);
      usingBackend = true;
    } catch (error) {
      health = null;
      snapshot = {};
      records = buildRecordsFromLocalStorage();
      usingBackend = false;
    }

    renderMetrics(metrics, records);
    renderPipeline(pipeline, records);
    renderTable();
    renderHouseholds();
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
