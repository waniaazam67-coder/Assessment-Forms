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
  const response = await fetch(`${backendBaseUrl}${path}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
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
  const eligibleCount = records.filter((record) => String(record?.eligibilityStatus || "").toLowerCase() === "passed").length;
  const notEligibleCount = records.filter((record) => String(record?.eligibilityStatus || "").toLowerCase() === "failed").length;
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

  const normalize = (value) => String(value || "").trim().toLowerCase();
  const locationTerm = normalize(filters.location);
  const statusTerm = normalize(filters.status);
  const nameTerm = normalize(filters.name);
  const stageTerm = normalize(filters.stage);
  const startDate = normalize(filters.startDate);
  const endDate = normalize(filters.endDate);

  const filtered = records.filter((record) => {
    const location = `${record.city || ""} ${record.ucnc || ""} ${record.address || ""}`.toLowerCase();
    const names = `${record.cmoName || ""} ${record.engineerName || ""}`.toLowerCase();
    const recordStatus = normalize(record.eligibilityStatus);
    const recordDate = normalize(record.surveyDate);
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
    const status = normalize(record.eligibilityStatus) === "passed" ? "Passed" : "Failed";
    const statusTone = status === "Passed" ? "green" : "failed";

    row.innerHTML = `
      <td>${record.householdId || "-"}</td>
      <td>
        <strong class="admin-table__primary">${location}</strong>
        <small class="admin-table__meta">${record.cmoName || record.engineerName ? [record.cmoName, record.engineerName].filter(Boolean).join(" / ") : "No staff captured"}</small>
      </td>
      <td>${record.catchmentArea || "-"}</td>
      <td>${record.tankSpace || "-"}</td>
      <td><span class="admin-chip admin-chip--${statusTone}">${status}</span></td>
    `;
    container.append(row);
  });
}

function bootLoginPage() {
  const form = document.querySelector("[data-admin-login-form]");
  const feedback = document.querySelector("[data-admin-feedback]");

  const existing = sessionStorage.getItem(AUTH_KEY);
  if (existing) {
    window.location.href = "dashboard.html";
    return;
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "").trim();

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      sessionStorage.setItem(
        AUTH_KEY,
        JSON.stringify({
          email: ADMIN_EMAIL,
          name: "Admin",
        })
      );
      window.location.href = "dashboard.html";
      return;
    }

    if (feedback) {
      feedback.textContent = "Invalid admin credentials.";
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

  const loadRecords = async () => {
    if (dataSource) {
      dataSource.textContent = "Loading latest records...";
    }

    try {
      const snapshot = await apiJsonRequest("/api/db");
      records = buildRecordsFromSnapshot(snapshot);
      usingBackend = true;
      if (dataSource) {
        dataSource.textContent = "Connected to Node.js + MySQL. Downloads use live database data.";
      }
    } catch (error) {
      records = buildRecordsFromLocalStorage();
      usingBackend = false;
      if (dataSource) {
        dataSource.textContent = "Backend is unavailable. Showing browser-stored data only.";
      }
    }

    renderMetrics(metrics, records);
    renderTable();
  };

  Object.values(filters).forEach((control) => {
    control?.addEventListener("input", renderTable);
    control?.addEventListener("change", renderTable);
  });

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
