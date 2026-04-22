const AUTH_KEY = "shehersaaz-admin-dashboard-auth";
const ADMIN_EMAIL = "admin@shehersaaz.com";
const ADMIN_PASSWORD = "Admin@2025";

const generatedIdsStorageKey = "shehersaaz-generated-household-ids";
const eligibleHouseholdsStorageKey = "shehersaaz-eligible-households";
const submittedFormsStorageKey = "shehersaaz-submitted-forms";
const seafResponsesStorageKey = "shehersaaz-seaf-responses";
const householdRecordsStorageKey = "shehersaaz-household-records";

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

function getHouseholdRecords() {
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
      stageStatus: {
        seaf: Boolean(submitted[householdId]?.seaf === "Submitted"),
        engineering: Boolean(submitted[householdId]?.engineering === "Submitted"),
        inventory: Boolean(submitted[householdId]?.inventory === "Submitted"),
      },
    });
  });

  return Array.from(map.values()).sort((left, right) => {
    if (left.surveyDate && right.surveyDate && left.surveyDate !== right.surveyDate) {
      return right.surveyDate.localeCompare(left.surveyDate);
    }

    return String(right.householdId).localeCompare(String(left.householdId));
  });
}

function getOverviewStats() {
  const records = getHouseholdRecords();
  const submitted = readJson(localStorage, submittedFormsStorageKey, {});

  const totalAssessed = records.length;
  const eligibleCount = records.filter((record) => record?.eligibilityStatus === "passed").length;
  const notEligibleCount = records.filter((record) => record?.eligibilityStatus === "failed").length;

  const submittedRecords = Object.values(submitted);
  const seafDone = records.filter((record) => record?.stageStatus?.seaf || submitted[record.householdId]?.seaf === "Submitted").length;
  const engineeringDone = records.filter((record) => record?.stageStatus?.engineering || submitted[record.householdId]?.engineering === "Submitted").length;
  const readyCount = submittedRecords.filter(
    (record) => record?.seaf === "Submitted" && record?.engineering === "Submitted" && record?.inventory === "Submitted"
  ).length;

  return [
    {
      label: "Total households assessed",
      value: totalAssessed,
      icon: "households",
      tone: "mint",
      note: "Includes eligible and not eligible",
    },
    {
      label: "Eligible / Passed households",
      value: eligibleCount,
      icon: "eligible",
      tone: "sky",
      note: "Passed the first-stage screening",
    },
    {
      label: "Not eligible",
      value: notEligibleCount,
      icon: "rejected",
      tone: "rose",
      note: "Did not qualify in household info",
    },
    {
      label: "Socioeconomic assessment done",
      value: seafDone,
      icon: "seaf",
      tone: "gold",
      note: "SEAF submitted",
    },
    {
      label: "Engineering assessment done",
      value: engineeringDone,
      icon: "engineering",
      tone: "peach",
      note: "Engineering form submitted",
    },
    {
      label: "Ready for RWHU installation",
      value: readyCount,
      icon: "ready",
      tone: "mint",
      note: "All assessments completed",
    },
  ];
}

function countSubmitted(record) {
  const status = record.status || {};
  const seaf = status.seaf === "Submitted";
  const engineering = status.engineering === "Submitted";
  const inventory = status.inventory === "Submitted";

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

function buildMetrics(records) {
  return getOverviewStats();
}

function renderMetrics(container, records) {
  container.innerHTML = "";
  buildMetrics(records).forEach((metric) => {
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

function renderHouseholds(container, records, searchTerm = "") {
  const normalizedTerm = searchTerm.trim().toLowerCase();
  const filtered = records.filter((record) => {
    if (!normalizedTerm) {
      return true;
    }

    return `${record.householdId} ${record.headName}`.toLowerCase().includes(normalizedTerm);
  });

  container.innerHTML = "";

  if (filtered.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="6">No households found.</td>`;
    container.append(row);
    return;
  }

  filtered.forEach((record) => {
    const state = countSubmitted(record);
    const statusText = state.complete ? "Completed" : "In Progress";
    const statusColor = state.complete ? "green" : "gold";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${record.householdId}</td>
      <td>${record.headName}</td>
      <td><span class="admin-chip ${state.seaf ? "admin-chip--done" : "admin-chip--pending"}">${state.seaf ? "Submitted" : "Pending"}</span></td>
      <td><span class="admin-chip ${state.engineering ? "admin-chip--done" : "admin-chip--pending"}">${state.engineering ? "Submitted" : "Pending"}</span></td>
      <td><span class="admin-chip ${state.inventory ? "admin-chip--done" : "admin-chip--pending"}">${state.inventory ? "Submitted" : "Pending"}</span></td>
      <td><span class="admin-chip admin-chip--${statusColor}">${statusText}</span></td>
    `;
    container.append(row);
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

function bootDashboardPage() {
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
  const filters = {
    location: document.querySelector("[data-admin-filter-location]"),
    status: document.querySelector("[data-admin-filter-status]"),
    name: document.querySelector("[data-admin-filter-name]"),
    startDate: document.querySelector("[data-admin-filter-start-date]"),
    endDate: document.querySelector("[data-admin-filter-end-date]"),
    stage: document.querySelector("[data-admin-filter-stage]"),
  };
  const logout = document.querySelector("[data-admin-logout]");

  if (name) {
    name.textContent = session.name || "Admin";
  }
  if (email) {
    email.textContent = session.email || ADMIN_EMAIL;
  }

  const records = getHouseholdRecords();
  if (metrics) {
    renderMetrics(metrics, records);
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

  Object.values(filters).forEach((control) => {
    control?.addEventListener("input", renderTable);
    control?.addEventListener("change", renderTable);
  });

  renderTable();

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

  logout?.addEventListener("click", () => {
    sessionStorage.removeItem(AUTH_KEY);
    window.location.href = "index.html";
  });
}

if (document.querySelector("[data-admin-login-form]")) {
  bootLoginPage();
}

if (document.querySelector("[data-admin-metrics]")) {
  bootDashboardPage();
}

