const manualDialog = document.querySelector("[data-manual-dialog]");
const openManualButton = document.querySelector("[data-open-manual]");
const closeManualButton = document.querySelector("[data-close-manual]");
const householdPickerLinks = Array.from(document.querySelectorAll("[data-household-picker-link]"));
const submittedFormsDialog = document.querySelector("[data-submitted-forms-dialog]");
const openSubmittedFormsButton = document.querySelector("[data-open-submitted-forms]");
const closeSubmittedFormsButton = document.querySelector("[data-close-submitted-forms]");
const submittedFormsBody = document.querySelector("[data-submitted-forms-body]");

const eligibleHouseholdsStorageKey = "shehersaaz-eligible-households";
const selectedHouseholdStorageKey = "shehersaaz-selected-household";
const submittedFormsStorageKey = "shehersaaz-submitted-forms";
const postRedirectMessageKey = "shehersaaz-post-redirect-message";
const seafResponsesStorageKey = "shehersaaz-seaf-responses";
const householdRecordsStorageKey = "shehersaaz-household-records";
const pendingSyncQueueStorageKey = "shehersaaz-pending-sync-queue";
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

if ("serviceWorker" in navigator && window.location.protocol !== "file:" && !isLocalFrontendDev) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}

if (manualDialog && openManualButton && closeManualButton) {
  openManualButton.addEventListener("click", () => {
    manualDialog.showModal();
  });

  closeManualButton.addEventListener("click", () => {
    manualDialog.close();
  });

  manualDialog.addEventListener("click", (event) => {
    const bounds = manualDialog.getBoundingClientRect();
    const clickedOutside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;

    if (clickedOutside) {
      manualDialog.close();
    }
  });
}

const readEligibleHouseholds = () => {
  try {
    const storedHouseholds = localStorage.getItem(eligibleHouseholdsStorageKey);
    const parsedHouseholds = storedHouseholds ? JSON.parse(storedHouseholds) : [];
    return Array.isArray(parsedHouseholds) ? parsedHouseholds : [];
  } catch (error) {
    return [];
  }
};

const readSubmittedForms = () => {
  try {
    const storedStatuses = localStorage.getItem(submittedFormsStorageKey);
    const parsedStatuses = storedStatuses ? JSON.parse(storedStatuses) : {};
    return parsedStatuses && typeof parsedStatuses === "object" ? parsedStatuses : {};
  } catch (error) {
    return {};
  }
};

const writeSubmittedForms = (data) => {
  localStorage.setItem(submittedFormsStorageKey, JSON.stringify(data));
};

const readHouseholdRecords = () => {
  try {
    const storedRecords = localStorage.getItem(householdRecordsStorageKey);
    const parsedRecords = storedRecords ? JSON.parse(storedRecords) : [];
    return Array.isArray(parsedRecords) ? parsedRecords : [];
  } catch (error) {
    return [];
  }
};

const writeHouseholdRecords = (records) => {
  localStorage.setItem(householdRecordsStorageKey, JSON.stringify(records));
};

const readPendingSyncQueue = () => {
  try {
    const storedQueue = localStorage.getItem(pendingSyncQueueStorageKey);
    const parsedQueue = storedQueue ? JSON.parse(storedQueue) : [];
    return Array.isArray(parsedQueue) ? parsedQueue : [];
  } catch (error) {
    return [];
  }
};

const writePendingSyncQueue = (queue) => {
  localStorage.setItem(pendingSyncQueueStorageKey, JSON.stringify(queue));
};

const findPendingSyncIndex = (queue, entry) =>
  queue.findIndex((queuedEntry) => {
    if (!queuedEntry || queuedEntry.path !== entry.path || (queuedEntry.method || "POST") !== (entry.method || "POST")) {
      return false;
    }

    return JSON.stringify(queuedEntry.body || {}) === JSON.stringify(entry.body || {});
  });

const enqueuePendingSync = (entry) => {
  const queue = readPendingSyncQueue();
  const normalizedEntry = {
    ...entry,
    createdAt: entry.createdAt || new Date().toISOString(),
  };
  const existingIndex = findPendingSyncIndex(queue, normalizedEntry);

  if (existingIndex >= 0) {
    queue[existingIndex] = {
      ...queue[existingIndex],
      ...normalizedEntry,
    };
  } else {
    queue.push(normalizedEntry);
  }

  writePendingSyncQueue(queue);
};

const apiJsonRequest = async (path, options = {}) => {
  let lastError = null;

  for (const baseUrl of backendBaseUrls) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method || "GET",
        cache: options.cache || "no-store",
        keepalive: Boolean(options.keepalive),
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        body: options.body,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to reach the backend API.");
};

const isEligibleHouseholdStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "passed" || normalized === "eligible" || normalized === "submitted";
};

const mergeEligibleHouseholds = (households = []) => {
  const map = new Map();

  households.forEach((household) => {
    if (!household?.householdId) {
      return;
    }

    map.set(household.householdId, {
      householdId: household.householdId,
      headName: household.headName || household.selected_household_name || "-",
      city: household.city || "",
      respondentCnic: household.respondentCnic || household.respondent_cnic || "",
      headCnic: household.headCnic || household.head_cnic || "",
      eligibilityStatus: household.eligibilityStatus || household.status || "",
    });
  });

  return Array.from(map.values()).sort((left, right) => String(left.householdId).localeCompare(String(right.householdId)));
};

const getEligibleHouseholdsForPicker = async () => {
  try {
    const households = await apiJsonRequest("/api/households");
    const eligibleHouseholds = Array.isArray(households)
      ? households.filter((household) => isEligibleHouseholdStatus(household?.eligibilityStatus || household?.status))
      : [];

    const normalized = mergeEligibleHouseholds(eligibleHouseholds);
    localStorage.setItem(eligibleHouseholdsStorageKey, JSON.stringify(normalized));
    return normalized;
  } catch (error) {
    return mergeEligibleHouseholds(readEligibleHouseholds());
  }
};

const flushPendingSyncQueue = async () => {
  const queue = readPendingSyncQueue();
  if (queue.length === 0) {
    return;
  }

  const remaining = [];

  for (const entry of queue) {
    try {
      await apiJsonRequest(entry.path, {
        method: entry.method || "POST",
        body: JSON.stringify(entry.body || {}),
      });
    } catch (error) {
      remaining.push(entry);
    }
  }

  writePendingSyncQueue(remaining);
};

const queueBackendSync = (path, body, method = "POST") => {
  return (async () => {
    try {
      const response = await apiJsonRequest(path, {
        method,
        body: JSON.stringify(body || {}),
        keepalive: method.toUpperCase() === "POST",
      });
      return {
        ok: true,
        queued: false,
        response,
      };
    } catch (error) {
      enqueuePendingSync({
        path,
        method,
        body,
        lastError: error instanceof Error ? error.message : String(error),
      });
      return {
        ok: false,
        queued: true,
        error,
      };
    }
  })();
};

window.addEventListener("online", () => {
  void flushPendingSyncQueue();
});

window.setTimeout(() => {
  void flushPendingSyncQueue();
}, 0);

const readSelectedHousehold = () => {
  try {
    const storedHousehold = sessionStorage.getItem(selectedHouseholdStorageKey);
    return storedHousehold ? JSON.parse(storedHousehold) : null;
  } catch (error) {
    return null;
  }
};

const writeSelectedHousehold = (household) => {
  if (!household || typeof household !== "object") {
    return;
  }

  try {
    sessionStorage.setItem(selectedHouseholdStorageKey, JSON.stringify(household));
  } catch (error) {
    // Ignore sessionStorage write errors.
  }
};

const getSelectedHouseholdIdentity = () => {
  const selectedHousehold = readSelectedHousehold() || {};
  const householdId = selectedHouseholdIdInput?.value?.trim?.() || selectedHousehold.householdId || "";
  const selectedHouseholdName = selectedHouseholdNameInput?.value?.trim?.() || selectedHousehold.headName || "";
  const respondentCnic = selectedHousehold.respondentCnic || "";
  const headCnic = selectedHousehold.headCnic || "";

  return {
    household_id: householdId,
    selected_household_name: selectedHouseholdName,
    respondent_cnic: respondentCnic,
    head_cnic: headCnic,
  };
};

const mergeSelectedHousehold = (patch = {}) => {
  const currentHousehold = readSelectedHousehold();
  const householdId = patch.householdId || currentHousehold?.householdId;
  if (!householdId) {
    return null;
  }

  const nextHousehold = {
    ...(currentHousehold || {}),
    ...patch,
    householdId,
  };

  writeSelectedHousehold(nextHousehold);
  return nextHousehold;
};

const cacheHouseholdRecord = (householdId, patch = {}) => {
  if (!householdId) {
    return null;
  }

  const records = readHouseholdRecords();
  const existingIndex = records.findIndex((record) => record?.householdId === householdId);
  const existingRecord = existingIndex >= 0 ? records[existingIndex] : { householdId };
  const nextRecord = {
    ...existingRecord,
    ...patch,
    householdId,
  };

  if (existingIndex >= 0) {
    records[existingIndex] = nextRecord;
  } else {
    records.unshift(nextRecord);
  }

  writeHouseholdRecords(records);
  return nextRecord;
};

const getHouseholdRecordById = (householdId) => {
  if (!householdId) {
    return null;
  }

  const records = readHouseholdRecords();
  return records.find((record) => record?.householdId === householdId) || null;
};

const upsertHouseholdRecord = (householdId, patch = {}, options = {}) => {
  const nextRecord = cacheHouseholdRecord(householdId, patch);
  if (!nextRecord) {
    return null;
  }

  if (options.syncBackend !== false) {
    queueBackendSync("/api/households", {
      householdId,
      ...nextRecord,
    });
  }

  return nextRecord;
};

const parseAreaValue = (value) => {
  const area = Number.parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(area) ? area : 0;
};

const getEngineeringAreaFromSource = (source = {}) => {
  if (!source || typeof source !== "object") {
    return 0;
  }

  return parseAreaValue(
    source.engineeringCatchmentTotalArea ||
    source.engineeringCatchmentArea ||
    source.catchmentTotalArea ||
    source.catchmentArea
  );
};

const hydrateHouseholdRecordFromBackend = async (householdId) => {
  if (!householdId) {
    return null;
  }

  try {
    const record = await apiJsonRequest(`/api/households/${encodeURIComponent(householdId)}`);
    if (record && typeof record === "object") {
      cacheHouseholdRecord(householdId, record);
      mergeSelectedHousehold({
        householdId,
        headName: record.headName || readSelectedHousehold()?.headName || "",
        city: record.city || readSelectedHousehold()?.city || "",
        respondentCnic: record.respondentCnic || readSelectedHousehold()?.respondentCnic || "",
        headCnic: record.headCnic || readSelectedHousehold()?.headCnic || "",
      });
      return record;
    }
  } catch (error) {
    // Fall back to cached frontend data when backend data is unavailable.
  }

  return getHouseholdRecordById(householdId);
};

const getFormSubmissionFromBackend = async (formKey, householdId) => {
  if (!formKey || !householdId) {
    return null;
  }

  try {
    const entry = await apiJsonRequest(`/api/forms/${encodeURIComponent(formKey)}/${encodeURIComponent(householdId)}`);
    return entry?.payload && typeof entry.payload === "object" ? entry.payload : null;
  } catch (error) {
    return null;
  }
};

const getEditableFormControls = (form) => {
  if (!form) {
    return [];
  }

  return Array.from(form.querySelectorAll("input, select, textarea")).filter((control) => {
    if (!control || control.closest("template")) {
      return false;
    }

    const type = String(control.getAttribute("type") || "").toLowerCase();
    if (["button", "submit", "reset", "hidden"].includes(type)) {
      return false;
    }

    return !control.readOnly;
  });
};

const serializeFormState = (form, meta = {}) => {
  return {
    version: 1,
    meta,
    controls: getEditableFormControls(form).map((control) => {
      const tagName = control.tagName.toLowerCase();
      const type = String(control.getAttribute("type") || "").toLowerCase();

      if (type === "checkbox" || type === "radio") {
        return {
          tagName,
          type,
          checked: Boolean(control.checked),
        };
      }

      return {
        tagName,
        type,
        value: control.value,
      };
    }),
  };
};

const restoreFormState = (form, formState) => {
  if (!form || !formState || !Array.isArray(formState.controls)) {
    return;
  }

  const controls = getEditableFormControls(form);
  formState.controls.forEach((savedControl, index) => {
    const control = controls[index];
    if (!control || !savedControl) {
      return;
    }

    const type = String(control.getAttribute("type") || "").toLowerCase();
    if (type === "checkbox" || type === "radio") {
      control.checked = Boolean(savedControl.checked);
      return;
    }

    control.value = savedControl.value ?? "";
  });
};

const stripPreviewLabel = (value) =>
  String(value || "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

const getNearestPreviewHeading = (control, headings) => {
  let latestHeading = "";

  headings.forEach((heading) => {
    if (heading.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) {
      latestHeading = stripPreviewLabel(heading.textContent);
    }
  });

  return latestHeading;
};

const getPreviewLabelForControl = (control, headings, fallbackIndex) => {
  const fieldLabel = control.closest(".field, .field-group")?.querySelector("span");
  if (fieldLabel?.textContent) {
    return stripPreviewLabel(fieldLabel.textContent);
  }

  const catchmentRow = control.closest("[data-catchment-row]");
  if (catchmentRow) {
    const rowName = stripPreviewLabel(catchmentRow.querySelector("td")?.textContent || "Catchment row");
    if (control.matches("[data-catchment-width]")) {
      return `${rowName} width`;
    }
    if (control.matches("[data-catchment-length]")) {
      return `${rowName} length`;
    }
    if (control.matches("[data-catchment-area]")) {
      return `${rowName} area`;
    }
    if (control.matches("[data-drainage-diameter]")) {
      const diameterInputs = Array.from(catchmentRow.querySelectorAll("[data-drainage-diameter]"));
      const diameterIndex = diameterInputs.indexOf(control);
      return `${rowName} drainage point ${diameterIndex + 1} diameter`;
    }
  }

  const inventoryRow = control.closest("[data-inventory-row]");
  if (inventoryRow) {
    const itemName =
      inventoryRow.dataset.itemName ||
      inventoryRow.querySelector(".inventory-table__item-name")?.textContent ||
      "Inventory item";
    const normalizedItemName = stripPreviewLabel(itemName);
    if (control.matches("[data-inventory-item-select]")) {
      return "Other inventory item";
    }
    if (control.matches("[data-inventory-spec-select]")) {
      return `${normalizedItemName} specification`;
    }
    if (control.matches("[data-inventory-quantity]")) {
      return `${normalizedItemName} quantity`;
    }
  }

  const closestLabel = control.closest("label");
  if (closestLabel && (control.type === "checkbox" || control.type === "radio")) {
    const labelClone = closestLabel.cloneNode(true);
    labelClone.querySelectorAll("input, select, textarea, button").forEach((node) => node.remove());
    const labelText = stripPreviewLabel(labelClone.textContent);
    if (labelText) {
      return labelText;
    }
  }

  const ariaLabel = stripPreviewLabel(control.getAttribute("aria-label"));
  if (ariaLabel) {
    return ariaLabel;
  }

  const placeholder = stripPreviewLabel(control.getAttribute("placeholder"));
  if (placeholder) {
    return placeholder;
  }

  const heading = getNearestPreviewHeading(control, headings);
  if (heading) {
    return heading;
  }

  return `Field ${fallbackIndex + 1}`;
};

const getPreviewValueForControl = (control) => {
  if (!control) {
    return "";
  }

  if (control.tagName === "SELECT") {
    return stripPreviewLabel(control.options[control.selectedIndex]?.textContent || control.value);
  }

  if (control.type === "checkbox" || control.type === "radio") {
    return control.checked ? "Selected" : "";
  }

  return stripPreviewLabel(control.value);
};

const buildPreviewEntriesFromForm = (form) => {
  if (!form) {
    return [];
  }

  const headings = Array.from(form.querySelectorAll(".section-header h2, .section-header h3, .repeatable-card__header h3"));
  const controls = Array.from(form.querySelectorAll("input, select, textarea")).filter((control) => {
    const type = String(control.type || "").toLowerCase();
    if (["hidden", "button", "submit", "reset"].includes(type)) {
      return false;
    }
    if (control.closest("template") || control.disabled) {
      return false;
    }
    return true;
  });

  const entries = [];
  const processedGroups = new Set();

  controls.forEach((control, index) => {
    const type = String(control.type || "").toLowerCase();
    if ((type === "checkbox" || type === "radio") && control.name) {
      if (processedGroups.has(control.name)) {
        return;
      }

      processedGroups.add(control.name);
      const groupControls = controls.filter((item) => item.name === control.name);
      const checkedControls = groupControls.filter((item) => item.checked);
      if (checkedControls.length === 0) {
        return;
      }

      const values = checkedControls.map((item, checkedIndex) => getPreviewLabelForControl(item, headings, checkedIndex)).filter(Boolean);
      entries.push({
        label: getNearestPreviewHeading(control, headings) || getPreviewLabelForControl(control, headings, index),
        value: values.join(", "),
      });
      return;
    }

    if ((type === "checkbox" || type === "radio") && !control.checked) {
      return;
    }

    const value = getPreviewValueForControl(control);
    if (!value) {
      return;
    }

    entries.push({
      label: getPreviewLabelForControl(control, headings, index),
      value,
    });
  });

  return entries;
};

const createPreviewDialog = () => {
  const dialog = document.createElement("dialog");
  dialog.className = "manual-dialog preview-dialog";
  dialog.dataset.previewDialog = "true";
  dialog.innerHTML = `
    <div class="manual-dialog__header preview-dialog__header">
      <div>
        <p class="manual-dialog__eyebrow">Review Before Submit</p>
        <h2 data-preview-title>Form preview</h2>
        <p class="preview-dialog__lead" data-preview-lead></p>
      </div>
      <button class="manual-dialog__close" type="button" data-preview-close aria-label="Close preview">&times;</button>
    </div>
    <div class="manual-dialog__body preview-dialog__body">
      <div class="preview-list" data-preview-list></div>
    </div>
    <div class="preview-dialog__actions">
      <button class="button button-muted" type="button" data-preview-edit>Edit Form</button>
      <button class="button button-primary" type="button" data-preview-submit>Submit Form</button>
    </div>
  `;

  document.body.append(dialog);
  return dialog;
};

const openSubmissionPreview = ({ title, lead, entries }) =>
  new Promise((resolve) => {
    const dialog = document.querySelector("[data-preview-dialog]") || createPreviewDialog();
    const titleElement = dialog.querySelector("[data-preview-title]");
    const leadElement = dialog.querySelector("[data-preview-lead]");
    const listElement = dialog.querySelector("[data-preview-list]");
    const editButton = dialog.querySelector("[data-preview-edit]");
    const submitButton = dialog.querySelector("[data-preview-submit]");
    const closeButton = dialog.querySelector("[data-preview-close]");

    if (titleElement) {
      titleElement.textContent = title || "Form preview";
    }

    if (leadElement) {
      leadElement.textContent = lead || "Please review the entered details before submitting.";
    }

    if (listElement) {
      listElement.innerHTML = "";
      (entries || []).forEach((entry) => {
        const item = document.createElement("article");
        item.className = "preview-item";
        item.innerHTML = `
          <h3>${entry.label}</h3>
          <p>${entry.value}</p>
        `;
        listElement.append(item);
      });

      if ((entries || []).length === 0) {
        const emptyState = document.createElement("p");
        emptyState.className = "helper-text";
        emptyState.textContent = "No filled fields were found to preview yet.";
        listElement.append(emptyState);
      }
    }

    const cleanup = () => {
      dialog.removeEventListener("cancel", handleCancel);
      editButton?.removeEventListener("click", handleEdit);
      submitButton?.removeEventListener("click", handleSubmit);
      closeButton?.removeEventListener("click", handleEdit);
      dialog.removeEventListener("click", handleBackdropClick);
    };

    const finish = (shouldSubmit) => {
      cleanup();
      dialog.close();
      resolve(shouldSubmit);
    };

    const handleCancel = (event) => {
      event.preventDefault();
      finish(false);
    };

    const handleEdit = () => finish(false);
    const handleSubmit = () => finish(true);
    const handleBackdropClick = (event) => {
      const bounds = dialog.getBoundingClientRect();
      const clickedOutside =
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom;

      if (clickedOutside) {
        finish(false);
      }
    };

    dialog.addEventListener("cancel", handleCancel);
    editButton?.addEventListener("click", handleEdit);
    submitButton?.addEventListener("click", handleSubmit);
    closeButton?.addEventListener("click", handleEdit);
    dialog.addEventListener("click", handleBackdropClick);
    dialog.showModal();
  });

const slugifySubmissionKey = (value, fallback = "field") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  const safeValue = normalized || fallback;
  return /^[0-9]/.test(safeValue) ? `field_${safeValue}` : safeValue;
};

const normalizeSubmissionCellValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value) || (value && typeof value === "object")) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
};

const extractControlLabelText = (control) => {
  if (!control) {
    return "";
  }

  const wrappedLabel = control.closest("label");
  if (wrappedLabel) {
    const clone = wrappedLabel.cloneNode(true);
    clone.querySelectorAll("input, select, textarea, button, template").forEach((element) => element.remove());
    const text = clone.textContent.replace(/\s+/g, " ").trim();
    if (text) {
      return text;
    }
  }

  const id = control.getAttribute("id");
  if (id) {
    const externalLabel = document.querySelector(`label[for="${id}"]`);
    if (externalLabel) {
      const text = externalLabel.textContent.replace(/\s+/g, " ").trim();
      if (text) {
        return text;
      }
    }
  }

  const tableCell = control.closest("td, th");
  if (tableCell?.previousElementSibling) {
    const text = tableCell.previousElementSibling.textContent.replace(/\s+/g, " ").trim();
    if (text) {
      return text;
    }
  }

  const heading = control.closest("section, article, .question-card, .inventory-question-card")?.querySelector("h3, h4, legend");
  return heading?.textContent.replace(/\s+/g, " ").trim() || "";
};

const getControlSubmissionKey = (control, index) => {
  const dataKeys = Object.keys(control?.dataset || {}).filter((key) => !["defaultQuantity", "toggleTarget", "toggleField"].includes(key));
  const candidates = [
    control?.getAttribute("data-db-field"),
    control?.getAttribute("name"),
    dataKeys[0],
    control?.getAttribute("id"),
    extractControlLabelText(control),
    `${control?.tagName?.toLowerCase?.() || "field"}_${index + 1}`,
  ];

  const candidate = candidates.find((value) => String(value || "").trim());
  return slugifySubmissionKey(candidate, `field_${index + 1}`);
};

const buildSubmissionTableRow = (form, extras = {}) => {
  if (!form) {
    return {};
  }

  const row = {};
  const usedKeys = new Map();
  const assignValue = (rawKey, value) => {
    const baseKey = slugifySubmissionKey(rawKey);
    const nextCount = (usedKeys.get(baseKey) || 0) + 1;
    usedKeys.set(baseKey, nextCount);
    const finalKey = nextCount === 1 ? baseKey : `${baseKey}_${nextCount}`;
    row[finalKey] = normalizeSubmissionCellValue(value);
  };

  const controls = getEditableFormControls(form);
  const radioGroups = new Set();

  controls.forEach((control, index) => {
    const type = String(control.getAttribute("type") || "").toLowerCase();
    const baseKey = getControlSubmissionKey(control, index);

    if (type === "radio") {
      const radioKey = slugifySubmissionKey(control.name || baseKey, `radio_${index + 1}`);
      if (!control.checked || radioGroups.has(radioKey)) {
        return;
      }

      radioGroups.add(radioKey);
      row[radioKey] = normalizeSubmissionCellValue(control.value || extractControlLabelText(control));
      return;
    }

    if (type === "checkbox") {
      const optionSource = control.value || extractControlLabelText(control) || `${baseKey}_${index + 1}`;
      const optionKey = slugifySubmissionKey(`${baseKey}_${optionSource}`, `checkbox_${index + 1}`);
      row[optionKey] = control.checked ? "Yes" : "No";
      return;
    }

    assignValue(baseKey, control.value);
  });

  Object.entries(extras || {}).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    row[slugifySubmissionKey(key)] = normalizeSubmissionCellValue(value);
  });

  return row;
};

const getCheckboxStateRow = (inputs, prefix) => {
  const row = {};

  Array.from(inputs || []).forEach((input) => {
    const optionKey = slugifySubmissionKey(input?.value || extractControlLabelText(input) || "option");
    row[`${prefix}_${optionKey}`] = input?.checked ? "Yes" : "No";
  });

  return row;
};

const getSocioTableRow = ({
  form,
  personList,
  facilityList,
  utilityList,
  facilities,
  utilities,
}) => {
  if (!form) {
    return {};
  }

  const housingPanel = form.querySelector("[data-socio-panel='housing']");
  const demographicsPanel = form.querySelector("[data-socio-panel='demographics']");
  const utilitiesPanel = form.querySelector("[data-socio-panel='utilities']");
  const urbanPanel = form.querySelector("[data-socio-panel='urban']");
  const floodingPanel = form.querySelector("[data-socio-panel='flooding']");
  const housingControls = Array.from(housingPanel?.querySelectorAll("input:not([readonly]), select, textarea") || []);
  const [
    householdsInDwellingInput,
    numberOfFloorsInput,
    numberOfRoomsInput,
    electricitySourceSelect,
    cookingFuelSelect,
    housingStructureSelect,
    roofTypeSelect,
  ] = housingControls;

  const householdMembers = Array.from(personList?.querySelectorAll(".repeatable-card") || []).map((card, index) => {
    const selects = Array.from(card.querySelectorAll("select"));
    return {
      memberNumber: index + 1,
      gender: selects[0]?.value || "",
      literacyLevel: selects[1]?.value || "",
      employmentStatus: selects[2]?.value || "",
    };
  });

  const utilityCheckboxes = Array.from(utilityList?.querySelectorAll("input[type='checkbox']") || []);
  const facilityCheckboxes = Array.from(facilityList?.querySelectorAll("input[type='checkbox']") || []);
  const utilityPanelCheckboxes = Array.from(utilitiesPanel?.querySelectorAll("input[type='checkbox']") || []);
  const basicUtilityCheckboxes = utilityPanelCheckboxes.slice(0, 3);
  const waterSourceCheckboxes = utilityPanelCheckboxes.slice(10, 26);
  const utilitiesControls = Array.from(utilitiesPanel?.querySelectorAll("input:not([readonly]):not([type='checkbox']), select, textarea") || []);
  const [quantityOfWaterSelect, qualityOfWaterSelect, solidWasteInput, streetSewersSelect, cleanlinessInput] = utilitiesControls;
  const urbanCheckboxes = Array.from(urbanPanel?.querySelectorAll("input[type='checkbox']") || []);
  const streetGreeneryCheckboxes = urbanCheckboxes.slice(0, 8);
  const houseGreeneryCheckboxes = urbanCheckboxes.slice(8, 16);
  const floodingSelect = floodingPanel?.querySelector("select");

  const row = {
    ...getSelectedHouseholdIdentity(),
    households_in_dwelling: householdsInDwellingInput?.value || "",
    number_of_floors: numberOfFloorsInput?.value || "",
    number_of_rooms: numberOfRoomsInput?.value || "",
    electricity_source: electricitySourceSelect?.value || "",
    cooking_and_heating_fuel: cookingFuelSelect?.value || "",
    housing_structure_type: housingStructureSelect?.value || "",
    roof_type: roofTypeSelect?.value || "",
    household_members_count: String(householdMembers.length),
    household_members_json: JSON.stringify(householdMembers),
    selected_facilities_json: JSON.stringify(facilities || []),
    selected_utilities_json: JSON.stringify(utilities || []),
    water_quantity: quantityOfWaterSelect?.value || "",
    water_quality: qualityOfWaterSelect?.value || "",
    household_solid_waste_disposal: solidWasteInput?.value || "",
    street_sewers_type: streetSewersSelect?.value || "",
    cleanliness_of_streets: cleanlinessInput?.value || "",
    flooding_history: floodingSelect?.value || "",
  };

  householdMembers.forEach((member, index) => {
    const prefix = `member_${index + 1}`;
    row[`${prefix}_gender`] = member.gender;
    row[`${prefix}_literacy_level`] = member.literacyLevel;
    row[`${prefix}_employment_status`] = member.employmentStatus;
  });

  Object.assign(row, getCheckboxStateRow(basicUtilityCheckboxes, "basic_utility"));
  Object.assign(row, getCheckboxStateRow(facilityCheckboxes, "facility_inside_house"));

  const waterSourceRow = {};
  waterSourceCheckboxes.forEach((input, index) => {
    const sectionPrefix = index < 7 ? "water_source_inside_house" : "water_source_outside_house";
    const optionKey = slugifySubmissionKey(input?.value || extractControlLabelText(input) || `option_${index + 1}`);
    waterSourceRow[`${sectionPrefix}_${optionKey}`] = input?.checked ? "Yes" : "No";
  });
  Object.assign(row, waterSourceRow);
  Object.assign(row, getCheckboxStateRow(streetGreeneryCheckboxes, "street_greening"));
  Object.assign(row, getCheckboxStateRow(houseGreeneryCheckboxes, "house_greening"));

  return row;
};

const getEngineeringTableRow = ({
  form,
  engineerName,
  catchmentRows,
  catchmentTotalAreaInput,
  housingWidthInput,
  housingDepthInput,
  housingAreaInput,
  waterNeedAreaInput,
  waterNeedSpaceInput,
  waterNeedQuantityInput,
  waterNeedHouseholdSizeInput,
  waterNeedDailyInput,
  waterNeedStorageInput,
}) => {
  if (!form) {
    return {};
  }

  const row = {
    ...getSelectedHouseholdIdentity(),
    engineer_name: engineerName || "",
    housing_width_ft: housingWidthInput?.value || "",
    housing_depth_ft: housingDepthInput?.value || "",
    housing_area_sq_ft: housingAreaInput?.value || "",
    total_catchment_area_sq_ft: catchmentTotalAreaInput?.value || "",
    proposed_storage_capacity: form.querySelector("[data-proposed-storage-capacity]")?.value || "",
    reasons_for_rejection: form.querySelector("textarea")?.value || "",
    water_need_area_a_sq_ft: waterNeedAreaInput?.value || "",
    water_need_space_s_cubic_ft: waterNeedSpaceInput?.value || "",
    water_need_quantity_q_liters: waterNeedQuantityInput?.value || "",
    water_need_household_size: waterNeedHouseholdSizeInput?.value || "",
    water_need_daily_liters: waterNeedDailyInput?.value || "",
    water_need_storage_liters: waterNeedStorageInput?.value || "",
  };

  Object.assign(row, getCheckboxStateRow(form.querySelectorAll("input[name='roof-material']"), "roof_material"));
  row.roof_material_other_text = form.querySelector("[data-toggle-field='roof-other'] input")?.value || "";
  Object.assign(row, getCheckboxStateRow(form.querySelectorAll("input[name='drainage-arrangement']"), "drainage_arrangement"));
  row.drainage_arrangement_other_text = form.querySelector("[data-toggle-field='drainage-other'] input")?.value || "";

  row.catchment_rows_json = JSON.stringify(
    Array.from(catchmentRows || []).map((catchmentRow, index) => ({
      areaName: catchmentRow.querySelector("td")?.textContent.trim() || `Catchment ${index + 1}`,
      widthFt: catchmentRow.querySelector("[data-catchment-width]")?.value || "",
      lengthFt: catchmentRow.querySelector("[data-catchment-length]")?.value || "",
      areaSqFt: catchmentRow.querySelector("[data-catchment-area]")?.value || "",
      drainagePoints: Array.from(catchmentRow.querySelectorAll("[data-drainage-diameter]")).map((input, diameterIndex) => ({
        point: diameterIndex + 1,
        diameter: input.value || "",
      })),
    }))
  );

  ["underground", "overhead"].forEach((tankType) => {
    row[`${tankType}_tank_count`] = form.querySelector(`[data-tank-count='${tankType}']`)?.value || "";
    row[`${tankType}_tank_material`] = form.querySelector(`[data-tank-material='${tankType}']`)?.value || "";
    row[`${tankType}_tank_total_capacity`] = form.querySelector(`[data-tank-total='${tankType}']`)?.value || "";

    const generatedRows = Array.from(form.querySelectorAll(`[data-generated-tank-row='${tankType}']`));
    row[`${tankType}_tanks_json`] = JSON.stringify(
      generatedRows.map((generatedRow, index) => ({
        tankNumber: index + 1,
        depth: generatedRow.querySelector("[data-tank-depth]")?.value || "",
        width: generatedRow.querySelector("[data-tank-width]")?.value || "",
        length: generatedRow.querySelector("[data-tank-length]")?.value || "",
        capacity: generatedRow.querySelector("[data-tank-capacity]")?.value || "",
      }))
    );
  });

  return row;
};

const getInventoryTableRow = ({
  form,
  catchmentArea,
  recommendedTank,
  selectedTankSize,
  palletSpec,
  otherItems,
}) => {
  if (!form) {
    return {};
  }

  const row = {
    ...getSelectedHouseholdIdentity(),
    catchment_area_from_engineering: catchmentArea || "",
    recommended_tank: recommendedTank || "",
    selected_tank_size_liters: selectedTankSize || "",
    pallet_spec_for_selected_tank: palletSpec || "",
    other_items_count: String(Array.isArray(otherItems) ? otherItems.length : 0),
    other_items_json: JSON.stringify(otherItems || []),
  };

  const cards = Array.from(form.querySelectorAll(".inventory-question-card"));
  cards.forEach((card) => {
    const title = card.querySelector("h3")?.textContent.trim() || "";
    if (!title || title.toLowerCase() === "other items") {
      return;
    }

    const key = slugifySubmissionKey(title);
    const specControl = card.querySelector("select, input[type='text']:not([readonly]) , input[type='text'][readonly], input:not([type='number'])");
    const quantityControl = card.querySelector("[data-inventory-quantity]");

    if (title.toLowerCase() === "water tank") {
      row.water_tank_size_liters = selectedTankSize || card.querySelector("[data-inventory-water-tank-select]")?.value || "";
      row.water_tank_quantity = quantityControl?.value || "";
      return;
    }

    const hasSpecificationLabel = Array.from(card.querySelectorAll("label span")).some((span) => span.textContent.trim().toLowerCase().includes("specification") || span.textContent.trim().toLowerCase().includes("size"));
    if (hasSpecificationLabel && specControl) {
      row[`${key}_specification`] = specControl.value || "";
    }

    row[`${key}_quantity`] = quantityControl?.value || "";
  });

  Array.from(otherItems || []).forEach((item, index) => {
    row[`other_item_${index + 1}_name`] = item?.name || "";
    row[`other_item_${index + 1}_quantity`] = item?.quantity || "";
  });

  return row;
};

const getHouseholdInfoTableRow = ({
  householdId,
  surveyDate,
  householdLocation,
  city,
  ucnc,
  interviewAddress,
  enumeratorName,
  catchmentArea,
  tankSpace,
  eligibilityStatus,
  respondentIsHouseholdHead,
  householdHeadCnic,
  householdHeadName,
  relationshipToHead,
  respondentCnic,
  respondentName,
  respondentPhoneNumber,
  respondentGender,
  respondentAge,
}) => {
  return {
    household_id: householdId || "",
    respondent_cnic: respondentCnic || "",
    head_cnic: householdHeadCnic || "",
    survey_date: surveyDate || "",
    household_location: householdLocation || "",
    city: city || "",
    ucnc: ucnc || "",
    interview_address: interviewAddress || "",
    enumerator_name: enumeratorName || "",
    catchment_area: catchmentArea || "",
    tank_space: tankSpace || "",
    eligibility_status: eligibilityStatus || "",
    respondent_is_household_head: respondentIsHouseholdHead || "",
    household_head_name: householdHeadName || "",
    relationship_to_head: relationshipToHead || "",
    respondent_name: respondentName || "",
    respondent_phone_number: respondentPhoneNumber || "",
    respondent_gender: respondentGender || "",
    respondent_age: respondentAge || "",
  };
};

const ensureRepeatableCount = (container, template, targetCount, addItem) => {
  if (!container || !template || typeof addItem !== "function") {
    return;
  }

  const normalizedTarget = Math.max(1, Number.parseInt(String(targetCount || "1"), 10) || 1);
  while (container.children.length < normalizedTarget) {
    addItem(container, template);
  }
};

const getEngineeringCatchmentAreaForHousehold = (householdId) => {
  const record = getHouseholdRecordById(householdId);
  return getEngineeringAreaFromSource(record);
};

const resolveEngineeringCatchmentArea = async (householdId) => {
  if (!householdId) {
    return 0;
  }

  const cachedArea = getEngineeringCatchmentAreaForHousehold(householdId);
  if (cachedArea > 0) {
    return cachedArea;
  }

  const householdRecord = await hydrateHouseholdRecordFromBackend(householdId);
  const backendArea = getEngineeringAreaFromSource(householdRecord);
  if (backendArea > 0) {
    return backendArea;
  }

  const engineeringSubmission = await getFormSubmissionFromBackend("engineering", householdId);
  const submissionArea = getEngineeringAreaFromSource(engineeringSubmission);
  if (submissionArea > 0) {
    cacheHouseholdRecord(householdId, {
      engineeringCatchmentArea: engineeringSubmission?.engineeringCatchmentArea || engineeringSubmission?.catchmentTotalArea || String(submissionArea),
      engineeringCatchmentTotalArea: engineeringSubmission?.engineeringCatchmentTotalArea || engineeringSubmission?.catchmentTotalArea || String(submissionArea),
    });
    return submissionArea;
  }

  return 0;
};

const getRecommendedTankSize = (catchmentArea) => {
  if (!Number.isFinite(catchmentArea) || catchmentArea < 200) {
    return "";
  }

  if (catchmentArea <= 399) {
    return "800";
  }

  if (catchmentArea <= 599) {
    return "1000";
  }

  if (catchmentArea <= 799) {
    return "1200";
  }

  if (catchmentArea <= 999) {
    return "1500";
  }

  return "2000";
};

const getPalletSpecForTank = (tankSize) => {
  const normalizedSize = String(tankSize || "").trim();
  if (["800", "1000", "1200"].includes(normalizedSize)) {
    return "39*47";
  }

  if (["1500", "2000"].includes(normalizedSize)) {
    return "47*47";
  }

  return "";
};

const getGenderFromCnic = (cnicValue) => {
  const digits = String(cnicValue || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  const lastDigit = Number.parseInt(digits.slice(-1), 10);
  if (!Number.isFinite(lastDigit)) {
    return "";
  }

  return lastDigit % 2 === 0 ? "Woman" : "Man";
};

const staffDirectoryByCity = {
  Rawalpindi: {
    cmos: ["Sakina Bashir", "Aurangzeb", "Mehreen Bibi"],
    engineers: ["Hamidullah", "Shakeel Abbas", "Muhammad Abdullah", "Daniyal Afza"],
  },
  Nowshera: {
    cmos: ["Syed Ibrahim Shah", "Muhammad Amjad Khan", "Gul Rukh Durrani", "Basmeena Bibi"],
    engineers: ["Abdul Wahab", "Muhammad Jawad Khan", "Luqman Zamir", "Abdul Majid"],
  },
};

const getStaffByCity = (city) => staffDirectoryByCity[city] || { cmos: [], engineers: [] };

const populateSelectOptions = (select, placeholder, values) => {
  if (!select) {
    return;
  }

  select.innerHTML = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  placeholderOption.disabled = true;
  placeholderOption.hidden = true;
  placeholderOption.selected = true;
  select.append(placeholderOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
};

const getHouseholdCity = (householdId) => {
  if (!householdId) {
    return "";
  }

  const records = readHouseholdRecords();
  const record = records.find((item) => item?.householdId === householdId);
  if (record?.city) {
    return record.city;
  }

  try {
    const storedHousehold = sessionStorage.getItem(selectedHouseholdStorageKey);
    const selectedHousehold = storedHousehold ? JSON.parse(storedHousehold) : null;
    if (selectedHousehold?.householdId === householdId && selectedHousehold?.city) {
      return selectedHousehold.city;
    }
  } catch (error) {
    // Fall through to an empty city when storage cannot be read.
  }

  return "";
};

const removeEligibleHousehold = (householdId) => {
  if (!householdId) {
    return;
  }

  const households = readEligibleHouseholds();
  const nextHouseholds = households.filter((household) => household.householdId !== householdId);

  if (nextHouseholds.length !== households.length) {
    localStorage.setItem(eligibleHouseholdsStorageKey, JSON.stringify(nextHouseholds));
  }
};

const isHouseholdFullySubmitted = (submission = {}) => {
  return submission.seaf === "Submitted" && submission.engineering === "Submitted" && submission.inventory === "Submitted";
};

const readSeafResponses = () => {
  try {
    const storedResponses = localStorage.getItem(seafResponsesStorageKey);
    const parsedResponses = storedResponses ? JSON.parse(storedResponses) : {};
    return parsedResponses && typeof parsedResponses === "object" ? parsedResponses : {};
  } catch (error) {
    return {};
  }
};

const writeSeafResponses = (data) => {
  localStorage.setItem(seafResponsesStorageKey, JSON.stringify(data));
};

const setSubmittedFormStatus = (householdId, formKey, status = "Submitted", syncOptions = {}) => {
  if (!householdId) {
    return Promise.resolve(null);
  }

  const submittedForms = readSubmittedForms();
  const existing = submittedForms[householdId] || {};
  const currentHeadName = selectedHouseholdNameInput ? selectedHouseholdNameInput.value.trim() : "";

  submittedForms[householdId] = {
    headName: existing.headName || currentHeadName,
    seaf: existing.seaf || "Pending",
    engineering: existing.engineering || "Pending",
    inventory: existing.inventory || "Pending",
    ...existing,
    [formKey]: status,
  };

  writeSubmittedForms(submittedForms);
  const householdPatch = syncOptions.householdPatch && typeof syncOptions.householdPatch === "object"
    ? syncOptions.householdPatch
    : {};
  upsertHouseholdRecord(householdId, {
    ...householdPatch,
    headName: currentHeadName || existing.headName || "",
    stageStatus: {
      seaf: submittedForms[householdId].seaf,
      engineering: submittedForms[householdId].engineering,
      inventory: submittedForms[householdId].inventory,
    },
  });

  const selectedHousehold = readSelectedHousehold();
  if (selectedHousehold?.householdId === householdId) {
    mergeSelectedHousehold({
      ...householdPatch,
      householdId,
      headName: currentHeadName || existing.headName || selectedHousehold.headName || "",
    });
  }

  const syncPromise = queueBackendSync(`/api/forms/${formKey}/submit`, {
    householdId,
    headName: currentHeadName || existing.headName || "",
    status,
    payload: syncOptions.payload || {},
    householdPatch,
  });

  if (isHouseholdFullySubmitted(submittedForms[householdId])) {
    removeEligibleHousehold(householdId);
  }

  return syncPromise;
};

const populateSubmittedFormsTable = () => {
  if (!submittedFormsBody) {
    return;
  }

  const households = readEligibleHouseholds();
  const submittedForms = readSubmittedForms();
  submittedFormsBody.innerHTML = "";

  const householdMap = new Map();

  households.forEach((household) => {
    if (household && household.householdId) {
      householdMap.set(household.householdId, {
        householdId: household.householdId,
        headName: household.headName || "-",
        status: submittedForms[household.householdId] || {},
      });
    }
  });

  Object.entries(submittedForms).forEach(([householdId, record]) => {
    if (!householdId) {
      return;
    }

    const existing = householdMap.get(householdId) || {
      householdId,
      headName: "-",
      status: {},
    };

    householdMap.set(householdId, {
      householdId,
      headName: existing.headName !== "-" ? existing.headName : record.headName || existing.headName,
      status: {
        ...existing.status,
        ...record,
      },
    });
  });

  const records = Array.from(householdMap.values());

  if (records.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="5" class="submitted-table__empty">No household submissions found yet.</td>`;
    submittedFormsBody.append(row);
    return;
  }

  records.forEach((household) => {
    const status = household.status || {};
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${household.householdId || "-"}</td>
      <td>${household.headName || "-"}</td>
      <td><span class="status-pill ${status.seaf === "Submitted" ? "is-submitted" : "is-pending"}">${status.seaf || "Pending"}</span></td>
      <td><span class="status-pill ${status.engineering === "Submitted" ? "is-submitted" : "is-pending"}">${status.engineering || "Pending"}</span></td>
      <td><span class="status-pill ${status.inventory === "Submitted" ? "is-submitted" : "is-pending"}">${status.inventory || "Pending"}</span></td>
    `;
    submittedFormsBody.append(row);
  });
};

if (submittedFormsDialog && openSubmittedFormsButton && closeSubmittedFormsButton) {
  openSubmittedFormsButton.addEventListener("click", () => {
    populateSubmittedFormsTable();
    submittedFormsDialog.showModal();
  });

  closeSubmittedFormsButton.addEventListener("click", () => {
    submittedFormsDialog.close();
  });

  submittedFormsDialog.addEventListener("click", (event) => {
    const bounds = submittedFormsDialog.getBoundingClientRect();
    const clickedOutside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;

    if (clickedOutside) {
      submittedFormsDialog.close();
    }
  });
}

try {
  const postRedirectMessage = sessionStorage.getItem(postRedirectMessageKey);

  if (postRedirectMessage) {
    sessionStorage.removeItem(postRedirectMessageKey);
    let toast = document.querySelector("[data-floating-message]");

    if (!toast) {
      toast = document.createElement("div");
      toast.className = "floating-message";
      toast.dataset.floatingMessage = "true";
      toast.innerHTML = `<p class="floating-message__text" data-floating-message-text></p>`;
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.append(toast);
    }

    const toastText = toast.querySelector("[data-floating-message-text]");
    if (toastText) {
      toastText.textContent = postRedirectMessage;
    }

    toast.classList.add("is-visible");
    window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2600);
  }
} catch (error) {
  // Ignore sessionStorage errors.
}

if (householdPickerLinks.length > 0) {
  const showHouseholdPicker = async (targetHref) => {
    let picker = document.querySelector("[data-household-picker]");
    let pickerList;

    if (!picker) {
      picker = document.createElement("div");
      picker.className = "household-picker-overlay";
      picker.dataset.householdPicker = "true";
      picker.hidden = true;
      picker.innerHTML = `
        <div class="household-picker-card" role="dialog" aria-modal="true" aria-labelledby="household-picker-title">
          <div class="household-picker-header">
            <div>
              <p class="household-picker-eyebrow">Eligible Households</p>
              <h2 id="household-picker-title">Select Household</h2>
            </div>
            <button class="household-picker-close" type="button" data-household-picker-close aria-label="Close selection">&times;</button>
          </div>
          <div class="household-picker-body">
            <p class="household-picker-copy">Choose the household you want to continue this assessment for.</p>
            <div class="household-picker-list" data-household-picker-list></div>
          </div>
        </div>
      `;
      document.body.append(picker);

      const closeButton = picker.querySelector("[data-household-picker-close]");
      if (closeButton) {
        closeButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          picker.hidden = true;
        });
      }

      picker.addEventListener("click", (event) => {
        if (event.target === picker) {
          event.preventDefault();
          picker.hidden = true;
        }
      });
    }

    pickerList = picker.querySelector("[data-household-picker-list]");
    if (!pickerList) {
      return;
    }

    pickerList.innerHTML = '<p class="household-picker-empty">Loading households...</p>';
    picker.hidden = false;

    const households = await getEligibleHouseholdsForPicker();
    pickerList.innerHTML = "";

    if (households.length === 0) {
      const emptyState = document.createElement("p");
      emptyState.className = "household-picker-empty";
      emptyState.textContent = "No eligible households have been submitted yet.";
      pickerList.append(emptyState);
    } else {
      households.forEach((household) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "household-picker-option";
        button.innerHTML = `
          <span class="household-picker-option__id">${household.householdId}</span>
          <span class="household-picker-option__name">${household.headName}</span>
        `;
        button.addEventListener("click", () => {
          sessionStorage.setItem(selectedHouseholdStorageKey, JSON.stringify(household));
          window.location.href = targetHref;
        });
        pickerList.append(button);
      });
    }

    picker.hidden = false;
  };

  householdPickerLinks.forEach((link) => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      await showHouseholdPicker(link.href);
    });
  });
}

const selectedHouseholdSummary = document.querySelector("[data-selected-household-summary]");
const selectedHouseholdIdInput = document.querySelector("[data-selected-household-id]");
const selectedHouseholdNameInput = document.querySelector("[data-selected-household-name]");
const inventoryForm = document.querySelector("[data-inventory-form]");
const inventoryCatchmentAreaInput = document.querySelector("[data-inventory-catchment-area]");
const inventoryRecommendedTankInput = document.querySelector("[data-inventory-recommended-tank]");
const inventoryFeedback = document.querySelector("[data-inventory-feedback]");
const inventoryWaterTankSelect = document.querySelector("[data-inventory-water-tank-select]");
const inventoryPalletSpecSelect = document.querySelector("[data-inventory-pallet-spec-select]");
const inventoryAddOtherItemButton = document.querySelector("[data-add-other-item]");
const inventoryRowsBody = document.querySelector("[data-inventory-rows]");
const lockedInventoryItemNames = new Set([
  "Rawal Plug",
  "Bib cock",
  "Pump nozel",
  "Plumber's tape / Teflon tape",
  "Plumber's thread",
  "Screws",
  "Ash clay bricks",
  "Thread sealant for GI Pipes and Fittings",
  "PPR Plugs",
  "PVC solvent",
]);

const inventoryItemCatalog = {
  "Water Tank(PVC)": ["750 liters", "800 liters", "1000 liters", "1200 liters", "1500 liters", "2000 liters"],
  "Water Tank(Stainless Steel)": ["750 liters", "800 liters", "1000 liters", "1200 liters", "1500 liters", "2000 liters"],
  "Coupling socket(Plain socket)": ["Coupling Socket 2''", "Coupling Socket 3''", "Coupling Socket 4''"],
  "Reducer Socket (Centric/Straight/Plain)": ["Cent. Reducer Socket 2'' x 3''", "Cent. Reducer Socket 2'' x 4''", "Cent. Reducer Socket 3'' x 4''"],
  "Reducer Socket (Eccentric)": ["Eccent. Reducer Socket 2'' x 3''", "Eccent. Reducer Socket 2'' x 4''", "Eccent. Reducer Socket 3'' x 4''"],
  "Eccentric Reducer Coupling Socket": ["Eccent. Reducer Coupling 2'' x 3''", "Eccent. Reducer Coupling 2'' x 4''", "Eccent. Reducer Coupling 3'' x 4''"],
  "Elbow 90 Degree (Plain)": ["90 Degree Elbow 2''", "90 Degree Elbow 3''", "90 Degree Elbow 4''"],
  "Reducer Elbow 90 Degree": ["90 Degree Reducer Elbow 2'' x 3''", "90 Degree Reducer Elbow 2'' x 4''", "90 Degree Reducer Elbow 3'' x 4''"],
  "Elbow 90 Degree with clean out plug": ["90 Degree Elbow 2'' (with plug)", "90 Degree Elbow 3'' (with plug)", "90 Degree Elbow 4'' (with plug)"],
  "Elbow 45 Degree (plain)": ["45 Degree Elbow 2''", "45 Degree Elbow 3''", "45 Degree Elbow 4''"],
  "Reducer elbow 45 Degree": ["45 Degree Reducer Elbow 2'' x 3''", "45 Degree Reducer Elbow 2'' x 4''", "45 Degree Reducer Elbow 3'' x 4''"],
  "Elbow 45 Degree with clean out plug": ["45 Degree Elbow 2'' (with plug)", "45 Degree Elbow 3'' (with plug)", "45 Degree Elbow 4'' (with plug)"],
  "Equal Tee/ Plain Tee": ["Tee 2''", "Tee 3''", "Tee 4''"],
  "Reducer Tee": ["Reducer Tee 2'' x 3''", "Reducer Tee 2'' x 4''", "Reducer Tee 3'' x 4''"],
  "Equal Tee with back port/clean out plug": ["Tee 2'' (with back plug)", "Tee 3'' (with back plug)", "Tee 4'' (with back plug)"],
  "Equal Tee with side port/clean out plug": ["Tee 2'' (with side plug)", "Tee 3'' (with side plug)", "Tee 4'' (with side plug)"],
  "45 Degree Skew Tee/Y-Tee/Yee": ["45 Degree Y-Tee 2''", "45 Degree Y-Tee 3''", "45 Degree Y-Tee 4''"],
  "45 Degree Reducer Tee/Y-Tee/Yee": ["45 Degree Reducer Tee 2'' x 3''", "45 Degree Reducer Tee 2'' x 4''", "45 Degree Reducer Tee 3'' x 4''"],
  "Plain Cross/Cross Tee": ["Plain Cross 2''", "Plain Cross 3''", "Plain Cross 4''"],
  "Reducer Cross": ["Reducer Cross 2'' x 3''", "Reducer Cross 2'' x 4''", "Reducer Cross 3'' x 4''"],
  "Y-Cross Double Branch": ["Y Cross 2''", "Y Cross 3''", "Y Cross 4''"],
  "Clean-out Plug": ["Clean-out 2''", "Clean-out 3''", "Clean-out 4''"],
  "Floor Drain": ["Floor Drain 6'' x 3''", "Floor Drain 6'' x 4''"],
  "Roof Drain": ["Roof Drain 6'' x 3''", "Roof Drain 6'' x 4''"],
  "End Cap": ["End cap 2''", "End cap 3''", "End cap 4''"],
  "PVC Pipes": ["2'' (SCH-40)", "2'' (SDR-41) (B-Class)", "2'' (SDR-26) (D-Class)", "3'' (SCH-40)", "3'' (SDR-41)(B-Class)", "3\"(SDR-26)(D-Class)", "4\" (SCH - 40)", "4'' (SDR-41)(B-Class)", "4\" (SDR-26)(D-Class)"],
  "Clamps for PVC Pipes": ["Clamp 2\"", "Clamp 3\"", "Clamp 4\"", "Clamp 6\""],
  "PVC Solvent Cement/Glue": ["Solvent 75 gram Pack", "Solvent 125 gram Pack", "Solvent 250 gram Pack", "Solvent 500 gram Pack", "Solvent 1000 gram Pack"],
  "Pallets": ["Pallet 39\" * 47\"", "Pallet 47\" * 47\""],
  "Thread sealant for GI Pipes and fittings": ["NA"],
  "Steel hooks": ["NA"],
  "Steel Nails": ["NA"],
  "Plumber's thread": ["NA"],
  "Plumber's tape/Teflon tape": ["NA"],
  "Ash clay bricks": ["NA"],
  "HH plate": ["NA"],
  "User guidelines": ["NA"],
  "GI Fittings": ["NA"],
  "Distribution box with power sockets": ["16 gauge waterproof"],
  "Electric water cooler": ["NA"],
  "Cement-sand mortar and plastered brick platforms": ["47\" * 47\" * 24\""],
  "PPR Plugs": ["NA"],
  "PVC solvent": ["NA"],
};

const inventoryItemAliases = {
  "Water Tank": "Water Tank(PVC)",
  "PVC solvent": "PVC Solvent Cement/Glue",
  "Coupling Socket": "Coupling socket(Plain socket)",
  "Reducer Socket (Centric / straight / Plain)": "Reducer Socket (Centric/Straight/Plain)",
  "Equal Tee / Plain Tee": "Equal Tee/ Plain Tee",
  "Elbow 90 degree": "Elbow 90 Degree (Plain)",
  "Elbow 45 degree": "Elbow 45 Degree (plain)",
  "Clamps": "Clamps for PVC Pipes",
  "Plumbers thread": "Plumber's thread",
  "Plumbers tape / Teflon tape": "Plumber's tape/Teflon tape",
  "Thread sealant for GI Pipes and fittings": "Thread sealant for GI Pipes and fittings",
  "Steel nails": "Steel Nails",
};

const inventoryItemNames = Object.keys(inventoryItemCatalog);

const getInventoryRows = () => {
  if (!inventoryRowsBody) {
    return [];
  }

  return Array.from(inventoryRowsBody.querySelectorAll("[data-inventory-row]"));
};

const getInventoryQuantityInputs = () => {
  if (!inventoryForm) {
    return [];
  }

  return Array.from(inventoryForm.querySelectorAll("[data-inventory-quantity]"));
};

const getInventorySpecSelectInputs = () => {
  if (!inventoryForm) {
    return [];
  }

  return Array.from(inventoryForm.querySelectorAll("[data-inventory-spec-select]"));
};

const getInventoryItemSelectInputs = () => {
  if (!inventoryForm) {
    return [];
  }

  return Array.from(inventoryForm.querySelectorAll("[data-inventory-item-select]"));
};

const getInventorySpecOptionsForItem = (itemName) => {
  return inventoryItemCatalog[itemName] || ["NA"];
};

const createInventoryItemSelect = (value) => {
  const select = document.createElement("select");
  select.dataset.inventoryItemSelect = "true";
  select.dataset.inventoryBound = "true";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select item";
  placeholder.disabled = true;
  placeholder.hidden = true;
  placeholder.selected = !value;
  select.append(placeholder);

  inventoryItemNames.forEach((itemName) => {
    const option = document.createElement("option");
    option.value = itemName;
    option.textContent = itemName;
    select.append(option);
  });

  select.value = inventoryItemNames.includes(value) ? value : "";
  return select;
};

const populateInventorySpecSelect = (row, itemName) => {
  const specSelect = row?.querySelector("[data-inventory-spec-select]");
  if (!specSelect) {
    return;
  }

  const specOptions = getInventorySpecOptionsForItem(itemName);
  const currentValue = specSelect.value;
  specSelect.innerHTML = "";

  specOptions.forEach((spec) => {
    const option = document.createElement("option");
    option.value = spec;
    option.textContent = spec;
    specSelect.append(option);
  });

  if (specOptions.includes(currentValue)) {
    specSelect.value = currentValue;
  } else if (specOptions.length > 0) {
    specSelect.value = specOptions[0];
  }
};

const syncInventoryCustomRow = (row) => {
  if (!row || row.dataset.inventoryRowType !== "custom") {
    return;
  }

  const itemCell = row.children[0];
  const currentItemName = row.dataset.itemName || "";
  let itemSelect = row.querySelector("[data-inventory-item-select]");

  if (!itemSelect && itemCell) {
    itemSelect = createInventoryItemSelect(currentItemName);
    itemCell.textContent = "";
    itemCell.append(itemSelect);
  } else if (itemSelect && currentItemName) {
    itemSelect.value = currentItemName;
  }

  if (!itemSelect) {
    return;
  }

  const applyCurrentItem = () => {
    const selectedItem = itemSelect.value || "";
    row.dataset.itemName = selectedItem;
    populateInventorySpecSelect(row, selectedItem);
  };

  if (!itemSelect.dataset.inventoryBoundAttached) {
    itemSelect.addEventListener("change", applyCurrentItem);
    itemSelect.dataset.inventoryBoundAttached = "true";
  }

  applyCurrentItem();
};

const clearInventoryCustomRows = () => {
  if (!inventoryRowsBody) {
    return;
  }

  getInventoryRows()
    .filter((row) => row.dataset.inventoryRowType === "custom")
    .forEach((row) => row.remove());
};

const restoreInventoryRowsFromItems = (items = []) => {
  if (!Array.isArray(items) || !inventoryRowsBody) {
    return false;
  }

  const customItems = items.filter((item) => item?.isCustom);

  clearInventoryCustomRows();

  customItems.forEach((item) => {
    addInventoryOtherItemRow();
    const customRows = Array.from(inventoryRowsBody.querySelectorAll("[data-inventory-row-type='custom']"));
    const row = customRows[customRows.length - 1];
    if (!row) {
      return;
    }

    const nameSelect = row.querySelector("[data-inventory-item-select]");
    const specSelect = row.querySelector("[data-inventory-spec-select]");
    const quantityInput = row.querySelector("[data-inventory-quantity]");

    if (nameSelect && item.name) {
      nameSelect.value = item.name;
    }

    syncInventoryCustomRow(row);

    if (specSelect && item.specification) {
      specSelect.value = item.specification;
    }

    if (quantityInput && item.quantity !== undefined) {
      quantityInput.value = item.quantity;
    }
  });

  return true;
};

const syncInventoryPalletSpec = () => {
  if (!inventoryPalletSpecSelect) {
    return;
  }

  inventoryPalletSpecSelect.value = getPalletSpecForTank(inventoryWaterTankSelect?.value || "");
};

const getInventoryRowItemName = (row) => {
  if (!row) {
    return "";
  }

  const itemSelect = row.querySelector("[data-inventory-item-select]");
  if (itemSelect) {
    return itemSelect.value.trim();
  }

  return (
    row.dataset.itemName ||
    row.querySelector(".inventory-table__item-name")?.textContent?.replace(/\s+As per requirement\s*$/i, "").trim() ||
    ""
  );
};

const isLockedInventoryRow = (row) => {
  const itemName = getInventoryRowItemName(row);
  if (!itemName) {
    return false;
  }

  if (row.dataset.inventoryRowType === "locked") {
    return true;
  }

  if (itemName.startsWith("Steel nails")) {
    return true;
  }

  return lockedInventoryItemNames.has(itemName);
};

const syncInventoryRowLockState = () => {
  if (!inventoryRowsBody) {
    return;
  }

  const rows = getInventoryRows();
  const lockedRows = rows.filter((row) => isLockedInventoryRow(row) || row.dataset.inventoryRowType === "locked");
  lockedRows.forEach((row) => {
    inventoryRowsBody.append(row);
  });

  getInventoryRows().forEach((row) => {
    const locked = isLockedInventoryRow(row);
    row.classList.toggle("inventory-row--locked", locked);
    row.dataset.inventoryRowState = locked ? "locked" : "editable";

    if (row.dataset.inventoryRowType === "custom") {
      syncInventoryCustomRow(row);
    }

    row.querySelectorAll("input, select, textarea").forEach((control) => {
      if (control.type === "button" || control.matches("[data-remove-inventory-row]") || control.matches("[data-inventory-item-select]")) {
        return;
      }

      control.disabled = locked;
    });
  });
};

const syncSelectedHouseholdFields = (selectedHousehold) => {
  if (!selectedHousehold || typeof selectedHousehold !== "object") {
    return;
  }

  if (selectedHouseholdSummary) {
    selectedHouseholdSummary.hidden = false;
    selectedHouseholdSummary.textContent = `Selected household: ${selectedHousehold.householdId || ""} - ${selectedHousehold.headName || ""}`;
  }

  if (selectedHouseholdIdInput && !selectedHouseholdIdInput.value) {
    selectedHouseholdIdInput.value = selectedHousehold.householdId || "";
  }

  if (selectedHouseholdNameInput) {
    selectedHouseholdNameInput.value = selectedHousehold.headName || selectedHouseholdNameInput.value || "";
  }
};

if (selectedHouseholdSummary || selectedHouseholdIdInput || selectedHouseholdNameInput) {
  const selectedHousehold = readSelectedHousehold();
  if (selectedHousehold) {
    syncSelectedHouseholdFields(selectedHousehold);
    void (async () => {
      const record = await hydrateHouseholdRecordFromBackend(selectedHousehold.householdId || "");
      if (record) {
        syncSelectedHouseholdFields({
          ...selectedHousehold,
          ...record,
        });
      }
    })();
  }
}

if (inventoryForm) {
  const inventorySubmitButton = document.querySelector("[data-inventory-submit]");
  let otherItemCount = 0;

  const createOtherItemRow = () => {
    otherItemCount += 1;
    const row = document.createElement("tr");
    row.className = "inventory-row inventory-row--custom";
    row.dataset.inventoryRow = "true";
    row.dataset.inventoryRowType = "custom";
    row.innerHTML = `
      <td>
        <div class="inventory-row__item-field">
          <select data-inventory-item-select></select>
          <button class="button button-inline button-remove inventory-row__remove" type="button" data-remove-inventory-row aria-label="Remove custom item">
            Remove
          </button>
        </div>
      </td>
      <td>
        <select data-inventory-spec-select>
          <option selected>NA</option>
        </select>
      </td>
      <td>
        <input type="number" min="0" step="1" value="1" data-inventory-quantity data-default-quantity="1">
      </td>
    `;
    const itemSelect = row.querySelector("[data-inventory-item-select]");
    if (itemSelect) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select item";
      placeholder.disabled = true;
      placeholder.hidden = true;
      placeholder.selected = true;
      itemSelect.append(placeholder);

      inventoryItemNames.forEach((itemName) => {
        const option = document.createElement("option");
        option.value = itemName;
        option.textContent = itemName;
        itemSelect.append(option);
      });
    }
    syncInventoryCustomRow(row);
    return row;
  };

  const addInventoryOtherItemRow = () => {
    if (!inventoryRowsBody) {
      return;
    }

    const nextLockedRow = inventoryRowsBody.querySelector("[data-inventory-row-type='locked']");
    const row = createOtherItemRow();
    if (nextLockedRow) {
      inventoryRowsBody.insertBefore(row, nextLockedRow);
      return;
    }

    inventoryRowsBody.append(row);
  };

  const applyInventoryDefaults = async () => {
    const householdId = selectedHouseholdIdInput ? selectedHouseholdIdInput.value.trim() : "";
    const catchmentArea = await resolveEngineeringCatchmentArea(householdId);
    const recommendedTankSize = getRecommendedTankSize(catchmentArea);

    if (inventoryCatchmentAreaInput) {
      inventoryCatchmentAreaInput.value = catchmentArea > 0 ? `${catchmentArea.toFixed(2)} sq ft` : "";
    }

    if (inventoryRecommendedTankInput) {
      inventoryRecommendedTankInput.value = recommendedTankSize ? `${recommendedTankSize} liters` : "No recommendation";
    }

    if (recommendedTankSize) {
      if (inventoryWaterTankSelect) {
        inventoryWaterTankSelect.value = recommendedTankSize;
      }
    }

    syncInventoryPalletSpec();

    getInventoryQuantityInputs().forEach((input) => {
      if (!input.value) {
        input.value = input.dataset.defaultQuantity || "1";
      }
    });

    getInventorySpecSelectInputs().forEach((select) => {
      if (!select.value && select.options.length > 0) {
        select.selectedIndex = 0;
      }
    });

    if (inventoryFeedback) {
      if (recommendedTankSize && catchmentArea > 0) {
        inventoryFeedback.textContent = `Catchment area ${catchmentArea.toFixed(2)} sq ft maps to a ${recommendedTankSize} liter tank.`;
      } else if (catchmentArea > 0) {
        inventoryFeedback.textContent = `Catchment area ${catchmentArea.toFixed(2)} sq ft does not match one of the configured tank bands yet.`;
      } else {
        inventoryFeedback.textContent = "No catchment total was found from the engineering form.";
      }
      inventoryFeedback.classList.remove("form-feedback-error");
      inventoryFeedback.classList.remove("form-feedback-success");
    }
  };

  syncInventoryRowLockState();
  void applyInventoryDefaults();

  if (inventoryWaterTankSelect) {
    inventoryWaterTankSelect.addEventListener("change", () => {
      syncInventoryPalletSpec();
    });
  }

  if (inventoryAddOtherItemButton && inventoryRowsBody) {
    inventoryAddOtherItemButton.addEventListener("click", () => {
      addInventoryOtherItemRow();
    });
  }

  if (inventoryRowsBody) {
    inventoryRowsBody.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-inventory-row]");
      if (!removeButton) {
        return;
      }

      const row = removeButton.closest("[data-inventory-row]");
      if (row && row.dataset.inventoryRowType === "custom") {
        row.remove();
      }
    });
  }

  const applyInventorySubmission = async () => {
    const householdId = selectedHouseholdIdInput ? selectedHouseholdIdInput.value.trim() : "";
    if (!householdId) {
      return;
    }

    const inventoryPayload = await getFormSubmissionFromBackend("inventory", householdId);
    if (!inventoryPayload) {
      return;
    }

    const storedCustomItems = Array.isArray(inventoryPayload.items)
      ? inventoryPayload.items.filter((item) => item?.isCustom).length
      : 0;
    const otherItemsCount = inventoryPayload.formState?.meta?.otherItemsCount || storedCustomItems || inventoryPayload.otherItems?.length || 0;

    while ((inventoryRowsBody?.querySelectorAll("[data-inventory-row-type='custom']").length || 0) < otherItemsCount) {
      addInventoryOtherItemRow();
    }

    const hasStructuredInventoryItems = Array.isArray(inventoryPayload.items) && inventoryPayload.items.length > 0;
    if (hasStructuredInventoryItems) {
      restoreInventoryRowsFromItems(inventoryPayload.items);
    } else {
      restoreFormState(inventoryForm, inventoryPayload.formState);
      getInventoryRows().forEach((row) => {
        if (row.dataset.inventoryRowType === "custom") {
          syncInventoryCustomRow(row);
        }
      });
    }

    syncInventoryRowLockState();

    if (inventoryCatchmentAreaInput && inventoryPayload.catchmentArea) {
      inventoryCatchmentAreaInput.value = inventoryPayload.catchmentArea;
    }

    if (inventoryRecommendedTankInput && inventoryPayload.recommendedTank) {
      inventoryRecommendedTankInput.value = inventoryPayload.recommendedTank;
    }

    if (inventoryWaterTankSelect && inventoryPayload.selectedTankSize) {
      inventoryWaterTankSelect.value = inventoryPayload.selectedTankSize;
    }

    if (inventoryPalletSpecSelect) {
      inventoryPalletSpecSelect.value = inventoryPayload.palletSpec || getPalletSpecForTank(inventoryWaterTankSelect?.value || "");
    }
  };

  void applyInventorySubmission();

  const getInventoryRowSpecification = (row) => {
    if (!row) {
      return "";
    }

    const specSelect = row.querySelector("[data-inventory-spec-select]");
    if (specSelect) {
      return specSelect.value || "";
    }

    return row.dataset.requiredSpec || row.querySelector(".inventory-row__requirement")?.textContent.trim() || "";
  };

  const getInventoryRowQuantity = (row) => {
    if (!row) {
      return "";
    }

    const quantityInput = row.querySelector("[data-inventory-quantity]");
    if (quantityInput) {
      return quantityInput.value || "";
    }

    return row.dataset.requiredQuantity || "";
  };

  const collectInventoryItems = () =>
    getInventoryRows()
      .map((row) => {
        const name = getInventoryRowItemName(row);
        if (!name) {
          return null;
        }

        return {
          name,
          specification: getInventoryRowSpecification(row),
          quantity: getInventoryRowQuantity(row),
          isCustom: row.dataset.inventoryRowType === "custom",
          isLocked: isLockedInventoryRow(row),
        };
      })
      .filter(Boolean);

  const getInventoryTableKey = (itemName) => {
    const normalizedName = inventoryItemAliases[itemName] || itemName;
    const keyMap = {
      "PVC Pipes": "pvc_pipes",
      "Coupling Socket": "coupling_socket",
      "Elbow 90 degree": "elbow_90_degree",
      "Elbow 45 degree": "elbow_45_degree",
      "Equal Tee / Plain Tee": "equal_tee_plain_tee",
      "Clean-out Plug": "clean_out_plug",
      "End Cap": "end_cap",
      "Clamps": "clamps",
      "PPR Plugs": "ppr_plug",
      "Thread sealant for GI Pipes and Fittings": "thread_sealant_for_gi_pipes_and_fittings",
      "Ash clay bricks": "ash_clay_bricks",
      "Pallets": "pallets",
      "Reducer Socket (Centric / straight / Plain)": "reducer_socket_centric_straight_plain",
      "Reducer Socket (Eccentric)": "reducer_socket_eccentric",
      "Steel nails": "steel_nails_2",
      "Screws": "screws",
      "Plumber's thread": "plumbers_thread",
      "Plumber's tape / Teflon tape": "plumbers_tape_teflon_tape",
      "Pump nozel": "pump_nozel",
      "Bib cock": "bib_cock",
      "Rawal Plug": "rawal_plug",
    };

    return keyMap[itemName] || keyMap[normalizedName] || slugifySubmissionKey(itemName);
  };

  const buildInventoryTableRowFromItems = ({ items, catchmentArea, recommendedTank, selectedTankSize, palletSpec }) => {
    const otherItems = items.filter((item) => item.isCustom);
    const row = {
      ...getSelectedHouseholdIdentity(),
      catchment_area_from_engineering: catchmentArea || "",
      recommended_tank: recommendedTank || "",
      selected_tank_size_liters: selectedTankSize || "",
      pallet_spec_for_selected_tank: palletSpec || "",
      other_items_count: String(otherItems.length),
      other_items_json: JSON.stringify(otherItems),
    };

    items
      .filter((item) => !item.isCustom)
      .forEach((item) => {
        if (item.name === "Water Tank") {
          row.water_tank_size_liters = selectedTankSize || item.specification || "";
          row.water_tank_quantity = item.quantity || "";
          return;
        }

        const key = getInventoryTableKey(item.name);
        if (item.specification && item.specification !== "As per requirement") {
          row[`${key}_specification`] = item.specification;
        }
        row[`${key}_quantity`] = item.quantity || "";
      });

    otherItems.slice(0, 10).forEach((item, index) => {
      row[`other_item_${index + 1}_name`] = item.name || "";
      row[`other_item_${index + 1}_quantity`] = item.quantity || "";
    });

    return row;
  };

  const collectInventorySubmissionPayload = () => {
    const items = collectInventoryItems();
    const otherItems = items.filter((item) => item.isCustom);
    const catchmentArea = inventoryCatchmentAreaInput?.value || "";
    const recommendedTank = inventoryRecommendedTankInput?.value || "";
    const selectedTankSize = inventoryWaterTankSelect?.value || "";
    const palletSpec = inventoryPalletSpecSelect?.value || "";

    return {
      formState: serializeFormState(inventoryForm, {
        otherItemsCount: otherItems.length,
      }),
      catchmentArea,
      recommendedTank,
      selectedTankSize,
      palletSpec,
      quantities: getInventoryQuantityInputs().map((input) => ({
        value: input.value,
        defaultValue: input.dataset.defaultQuantity || "",
      })),
      specs: getInventorySpecSelectInputs().map((select) => select.value),
      items,
      otherItems,
      tableRow: buildInventoryTableRowFromItems({
        items,
        catchmentArea,
        recommendedTank,
        selectedTankSize,
        palletSpec,
        otherItems,
      }),
    };
  };

  if (inventorySubmitButton) {
    inventorySubmitButton.addEventListener("click", async () => {
      const householdId = selectedHouseholdIdInput ? selectedHouseholdIdInput.value.trim() : "";

      if (!householdId) {
        if (inventoryFeedback) {
          inventoryFeedback.textContent = "Please select a household before submitting the inventory form.";
          inventoryFeedback.classList.add("form-feedback-error");
          inventoryFeedback.classList.remove("form-feedback-success");
        }
        return;
      }

      const shouldSubmitInventory = await openSubmissionPreview({
        title: "Inventory Preview",
        lead: "Review the selected inventory items and quantities before submitting.",
        entries: buildPreviewEntriesFromForm(inventoryForm),
      });

      if (!shouldSubmitInventory) {
        return;
      }

      const inventoryPayload = collectInventorySubmissionPayload();
      try {
        await setSubmittedFormStatus(householdId, "inventory", "Submitted", {
          payload: inventoryPayload,
          householdPatch: {
            inventoryCatchmentArea: inventoryPayload.catchmentArea,
            inventoryRecommendedTank: inventoryPayload.recommendedTank,
            inventorySelectedTankSize: inventoryPayload.selectedTankSize,
          },
        });
      } catch (error) {
        if (inventoryFeedback) {
          inventoryFeedback.textContent = "Inventory was saved locally, but the backend/database save did not complete yet.";
          inventoryFeedback.classList.add("form-feedback-error");
          inventoryFeedback.classList.remove("form-feedback-success");
        }
      }

      try {
        sessionStorage.setItem(postRedirectMessageKey, `The Inventory form for household ID ${householdId} is submitted successfully.`);
      } catch (error) {
        // Ignore sessionStorage errors.
      }

      window.location.href = "index.html";
    });
  }

  try {
    const storedHousehold = sessionStorage.getItem(selectedHouseholdStorageKey);
    if (!storedHousehold) {
      window.setTimeout(() => {
        const inventoryPickerLink = householdPickerLinks.find((link) => {
          try {
            const targetUrl = new URL(link.href, window.location.href);
            return targetUrl.pathname.endsWith("/inventory.html") || targetUrl.pathname.endsWith("\\inventory.html");
          } catch (error) {
            return link.getAttribute("href") === "inventory.html";
          }
        });

        if (inventoryPickerLink) {
          inventoryPickerLink.click();
        }
      }, 0);
    }
  } catch (error) {
    // Ignore sessionStorage errors.
  }
}

const socioeconomicForm = document.querySelector("[data-socioeconomic-form]");
const engineeringForm = document.querySelector("[data-engineering-form]");

if (socioeconomicForm) {
  const socioTabs = Array.from(document.querySelectorAll("[data-socio-tab]"));
  const socioPanels = Array.from(document.querySelectorAll("[data-socio-panel]"));
  const socioContinueButton = document.querySelector("[data-socio-continue]");
  const personList = document.querySelector("[data-person-list]");
  const utilityList = document.querySelector("[data-utility-list]");
  const facilityList = document.querySelector("[data-facility-list]");
  const personTemplate = document.querySelector("[data-person-template]");
  const utilityTemplate = document.querySelector("[data-utility-template]");
  const facilityTemplate = document.querySelector("[data-facility-template]");
  const addPersonButton = document.querySelector("[data-add-person]");
  const addUtilityButton = document.querySelector("[data-add-utility]");
  const addFacilityButton = document.querySelector("[data-add-facility]");

  const socioStepOrder = ["housing", "demographics", "utilities", "urban", "flooding"];

  const saveSeafResponse = () => {
    const householdId = selectedHouseholdIdInput ? selectedHouseholdIdInput.value.trim() : "";
    if (!householdId) {
      return;
    }

    const facilities = facilityList
      ? Array.from(facilityList.querySelectorAll("select"))
          .map((select) => select.value.trim())
          .filter(Boolean)
      : [];
    const facilityChecks = facilityList
      ? Array.from(facilityList.querySelectorAll("input[type='checkbox']:checked"))
          .map((input) => input.value.trim())
          .filter(Boolean)
      : [];
    const utilityChecks = utilityList
      ? Array.from(utilityList.querySelectorAll("input[type='checkbox']:checked"))
          .map((input) => input.value.trim())
          .filter(Boolean)
      : [];

    const responses = readSeafResponses();
    const formState = serializeFormState(socioeconomicForm, {
      personCount: personList?.querySelectorAll(".repeatable-card").length || 1,
    });
    const selectedFacilities = facilities.length > 0 ? facilities : facilityChecks;
    const tableRow = getSocioTableRow({
      form: socioeconomicForm,
      personList,
      facilityList,
      utilityList,
      facilities: selectedFacilities,
      utilities: utilityChecks,
    });
    responses[householdId] = {
      ...(responses[householdId] || {}),
      facilities: selectedFacilities,
      utilities: utilityChecks,
      formState,
      tableRow,
    };
    writeSeafResponses(responses);
    upsertHouseholdRecord(householdId, {
      seafFacilities: selectedFacilities,
      seafUtilities: utilityChecks,
    });

    return responses[householdId];
  };

  const addRepeatableItem = (container, template) => {
    if (!container || !template) {
      return;
    }

    const fragment = template.content.cloneNode(true);
    const item = fragment.firstElementChild;
    container.append(fragment);

    const nextInput = item?.querySelector("input, select, textarea");
    if (nextInput) {
      nextInput.focus();
    }
  };

  const handleRemoveClick = (event, container) => {
    const removeButton = event.target.closest("[data-remove-item]");
    if (!removeButton || !container) {
      return;
    }

    if (container.children.length === 1) {
      return;
    }

    removeButton.closest(".repeatable-card")?.remove();
  };

  const setActiveSocioStep = (stepName) => {
    socioTabs.forEach((tab, index) => {
      const isActive = tab.dataset.socioTab === stepName;
      const activeIndex = socioStepOrder.indexOf(stepName);

      tab.classList.toggle("is-active", isActive);
      tab.classList.toggle("is-complete", !isActive && index < activeIndex);
    });

    socioPanels.forEach((panel) => {
      const isActive = panel.dataset.socioPanel === stepName;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });

    if (socioContinueButton) {
      socioContinueButton.textContent = stepName === socioStepOrder[socioStepOrder.length - 1] ? "Submit" : "Continue";
    }
  };

  socioTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setActiveSocioStep(tab.dataset.socioTab);
    });
  });

  if (addPersonButton) {
    addPersonButton.addEventListener("click", () => {
      addRepeatableItem(personList, personTemplate);
    });
  }

  if (addUtilityButton) {
    addUtilityButton.addEventListener("click", () => {
      addRepeatableItem(utilityList, utilityTemplate);
    });
  }

  if (addFacilityButton) {
    addFacilityButton.addEventListener("click", () => {
      addRepeatableItem(facilityList, facilityTemplate);
    });
  }

  if (personList) {
    personList.addEventListener("click", (event) => {
      handleRemoveClick(event, personList);
    });
  }

  if (utilityList) {
    utilityList.addEventListener("click", (event) => {
      handleRemoveClick(event, utilityList);
    });
  }

  if (facilityList) {
    facilityList.addEventListener("click", (event) => {
      handleRemoveClick(event, facilityList);
    });
  }

  const applySocioeconomicDefaults = async () => {
    const householdId = selectedHouseholdIdInput ? selectedHouseholdIdInput.value.trim() : "";
    if (!householdId) {
      return;
    }

    const seafPayload = await getFormSubmissionFromBackend("seaf", householdId);
    const formState = seafPayload?.formState || null;
    if (!formState) {
      return;
    }

    ensureRepeatableCount(personList, personTemplate, formState.meta?.personCount || 1, addRepeatableItem);
    restoreFormState(socioeconomicForm, formState);
  };

  void applySocioeconomicDefaults();

  if (socioContinueButton) {
    socioContinueButton.addEventListener("click", async () => {
      const activePanel = socioPanels.find((panel) => panel.classList.contains("is-active"));
      const currentStep = activePanel ? activePanel.dataset.socioPanel : socioStepOrder[0];
      const currentIndex = socioStepOrder.indexOf(currentStep);
      const nextStep = socioStepOrder[currentIndex + 1];

      if (nextStep) {
        setActiveSocioStep(nextStep);
        const nextInput = document.querySelector(`[data-socio-panel='${nextStep}'] input, [data-socio-panel='${nextStep}'] select, [data-socio-panel='${nextStep}'] textarea`);
        if (nextInput) {
          nextInput.focus();
        }
        return;
      }

      const householdId = selectedHouseholdIdInput ? selectedHouseholdIdInput.value.trim() : "";
      const shouldSubmitSeaf = await openSubmissionPreview({
        title: "Socioeconomic Assessment Preview",
        lead: "Review the socioeconomic assessment details before submitting.",
        entries: buildPreviewEntriesFromForm(socioeconomicForm),
      });

      if (!shouldSubmitSeaf) {
        return;
      }

      const seafPayload = saveSeafResponse();
      try {
        await setSubmittedFormStatus(householdId, "seaf", "Submitted", {
          payload: seafPayload || {},
          householdPatch: {
            seafFacilities: seafPayload?.facilities || [],
            seafUtilities: seafPayload?.utilities || [],
          },
        });
      } catch (error) {
        // Keep the local save and continue with the existing UX.
      }

      try {
        sessionStorage.setItem(postRedirectMessageKey, "The SEAF is submitted successfully.");
      } catch (error) {
        // Ignore sessionStorage errors.
      }

      window.location.href = "index.html";
    });
  }
}

if (engineeringForm) {
  const engineeringSubmitButton = document.querySelector("[data-engineering-submit]");
  const engineeringFeedback = document.querySelector("[data-engineering-feedback]");
  const engineerSelect = engineeringForm.querySelector("[data-engineer-select]");
  const toggleCheckboxes = Array.from(engineeringForm.querySelectorAll("[data-toggle-target]"));
  const housingWidthInput = engineeringForm.querySelector("[data-housing-width]");
  const housingDepthInput = engineeringForm.querySelector("[data-housing-depth]");
  const housingAreaInput = engineeringForm.querySelector("[data-housing-area]");
  const catchmentRows = Array.from(engineeringForm.querySelectorAll("[data-catchment-row]"));
  const tankSections = Array.from(engineeringForm.querySelectorAll("[data-tank-section]"));
  const tankCountInputs = Array.from(engineeringForm.querySelectorAll("[data-tank-count]"));
  const catchmentTotalAreaInput = engineeringForm.querySelector("[data-catchment-total-area]");
  const waterNeedAreaInput = engineeringForm.querySelector("[data-water-need-area]");
  const waterNeedSpaceInput = engineeringForm.querySelector("[data-water-need-space]");
  const waterNeedQuantityInput = engineeringForm.querySelector("[data-water-need-quantity]");
  const waterNeedHouseholdSizeInput = engineeringForm.querySelector("[data-water-need-household-size]");
  const waterNeedDailyInput = engineeringForm.querySelector("[data-water-need-daily]");
  const waterNeedStorageInput = engineeringForm.querySelector("[data-water-need-storage]");

  const setSelectValue = (select, value) => {
    if (!select || !value) {
      return;
    }

    const optionExists = Array.from(select.options).some((option) => option.value === value);
    if (!optionExists) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    }

    select.value = value;
  };

  const syncToggleField = (checkbox) => {
    const targetName = checkbox.dataset.toggleTarget;
    if (!targetName) {
      return;
    }

    const targetField = engineeringForm.querySelector(`[data-toggle-field='${targetName}']`);
    if (!targetField) {
      return;
    }

    targetField.hidden = !checkbox.checked;
    const targetInput = targetField.querySelector("input");
    if (targetInput && !checkbox.checked) {
      targetInput.value = "";
    }
  };

  const syncHousingStructureArea = () => {
    if (!housingWidthInput || !housingDepthInput || !housingAreaInput) {
      return;
    }

    const width = Number.parseFloat(housingWidthInput.value);
    const depth = Number.parseFloat(housingDepthInput.value);

    if (Number.isFinite(width) && Number.isFinite(depth)) {
      housingAreaInput.value = (width * depth).toFixed(2);
    } else {
      housingAreaInput.value = "";
    }

    syncWaterNeedCalculations();
  };

  toggleCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      syncToggleField(checkbox);
    });
    syncToggleField(checkbox);
  });

  const syncCatchmentTotalArea = () => {
    if (!catchmentTotalAreaInput) {
      return;
    }

    const totalArea = catchmentRows
      .map((row) => Number.parseFloat(row.querySelector("[data-catchment-area]")?.value || ""))
      .filter((value) => Number.isFinite(value))
      .reduce((sum, value) => sum + value, 0);

    catchmentTotalAreaInput.value = totalArea > 0 ? totalArea.toFixed(2) : "";
  };

  const syncCatchmentRow = (row) => {
    const widthInput = row.querySelector("[data-catchment-width]");
    const lengthInput = row.querySelector("[data-catchment-length]");
    const areaInput = row.querySelector("[data-catchment-area]");

    if (!widthInput || !lengthInput || !areaInput) {
      return;
    }

    const width = Number.parseFloat(widthInput.value);
    const length = Number.parseFloat(lengthInput.value);

    if (Number.isFinite(width) && Number.isFinite(length)) {
      areaInput.value = (width * length).toFixed(2);
      syncCatchmentTotalArea();
      syncWaterNeedCalculations();
      return;
    }

    areaInput.value = "";
    syncCatchmentTotalArea();
    syncWaterNeedCalculations();
  };

    const hasAtLeastOneCatchmentRow = () => {
      return catchmentRows.some((row) => {
        const widthValue = row.querySelector("[data-catchment-width]")?.value.trim() || "";
      const lengthValue = row.querySelector("[data-catchment-length]")?.value.trim() || "";
      const drainageValues = Array.from(row.querySelectorAll("[data-drainage-diameter]")).some((input) => input.value.trim() !== "");
      return widthValue !== "" || lengthValue !== "" || drainageValues;
      });
    };

    const syncWaterNeedCalculations = () => {
      if (!waterNeedAreaInput || !waterNeedSpaceInput || !waterNeedQuantityInput) {
        return;
      }

      const totalArea = Number.parseFloat(housingAreaInput?.value || "");
      const effectiveArea = Number.isFinite(totalArea) && totalArea > 0 ? totalArea : 0;

      const space = effectiveArea * 0.083;
      const quantity = space * 28.32 * 0.9;
      const householdSize = Number.parseFloat(waterNeedHouseholdSizeInput?.value || "");
      const dailyNeed = Number.isFinite(householdSize) ? householdSize * 50 : 0;
      const storageNeed = dailyNeed * 7;

      waterNeedAreaInput.value = effectiveArea > 0 ? effectiveArea.toFixed(2) : "";
      waterNeedSpaceInput.value = effectiveArea > 0 ? space.toFixed(2) : "";
      waterNeedQuantityInput.value = effectiveArea > 0 ? quantity.toFixed(2) : "";

      if (waterNeedDailyInput) {
        waterNeedDailyInput.value = Number.isFinite(householdSize) && householdSize > 0 ? dailyNeed.toFixed(2) : "";
      }

      if (waterNeedStorageInput) {
        waterNeedStorageInput.value = Number.isFinite(householdSize) && householdSize > 0 ? storageNeed.toFixed(2) : "";
      }
    };

    if (housingWidthInput) {
      housingWidthInput.addEventListener("input", syncHousingStructureArea);
    }

    if (housingDepthInput) {
      housingDepthInput.addEventListener("input", syncHousingStructureArea);
    }

  catchmentRows.forEach((row) => {
    const widthInput = row.querySelector("[data-catchment-width]");
    const lengthInput = row.querySelector("[data-catchment-length]");

    if (widthInput) {
      widthInput.addEventListener("input", () => {
        syncCatchmentRow(row);
      });
    }

    if (lengthInput) {
      lengthInput.addEventListener("input", () => {
        syncCatchmentRow(row);
      });
    }

    syncCatchmentRow(row);
  });

  const createTankRows = (tankType, count) => {
    const tankBody = engineeringForm.querySelector(`[data-tank-body='${tankType}']`);
    if (!tankBody) {
      return;
    }

    tankBody.innerHTML = "";

    if (count <= 0) {
      const row = document.createElement("tr");
      row.innerHTML = `<td colspan="5" class="submitted-table__empty">Enter the number of ${tankType} tanks to generate rows.</td>`;
      tankBody.append(row);
      return;
    }

    for (let index = 0; index < count; index += 1) {
      const row = document.createElement("tr");
      row.dataset.generatedTankRow = tankType;
      row.innerHTML = `
        <td>${index + 1}</td>
        <td><input type="number" min="0" step="0.01" placeholder="D" data-tank-depth></td>
        <td><input type="number" min="0" step="0.01" placeholder="W" data-tank-width></td>
        <td><input type="number" min="0" step="0.01" placeholder="L" data-tank-length></td>
        <td><input type="text" placeholder="Capacity" data-tank-capacity readonly></td>
      `;
      tankBody.append(row);
    }
  };

  const syncTankTotals = (tankType) => {
    const tankBody = engineeringForm.querySelector(`[data-tank-body='${tankType}']`);
    const totalInput = engineeringForm.querySelector(`[data-tank-total='${tankType}']`);
    if (!tankBody || !totalInput) {
      return;
    }

    const capacities = Array.from(tankBody.querySelectorAll("[data-tank-capacity]"))
      .map((input) => Number.parseFloat(input.value))
      .filter((value) => Number.isFinite(value));

    totalInput.value = capacities.length > 0
      ? capacities.reduce((sum, value) => sum + value, 0).toFixed(2)
      : "";
  };

  const syncTankRow = (row, tankType) => {
    const depthInput = row.querySelector("[data-tank-depth]");
    const widthInput = row.querySelector("[data-tank-width]");
    const lengthInput = row.querySelector("[data-tank-length]");
    const capacityInput = row.querySelector("[data-tank-capacity]");

    if (!depthInput || !widthInput || !lengthInput || !capacityInput) {
      return;
    }

    const depth = Number.parseFloat(depthInput.value);
    const width = Number.parseFloat(widthInput.value);
    const length = Number.parseFloat(lengthInput.value);

    if (Number.isFinite(depth) && Number.isFinite(width) && Number.isFinite(length)) {
      capacityInput.value = (depth * width * length).toFixed(2);
    } else {
      capacityInput.value = "";
    }

    syncTankTotals(tankType);
  };

  const setTankSectionState = (tankType, enabled) => {
    const section = engineeringForm.querySelector(`[data-tank-section='${tankType}']`);
    if (!section) {
      return;
    }

    section.classList.toggle("is-disabled", !enabled);
    Array.from(section.querySelectorAll("input, select, textarea, button")).forEach((element) => {
      if (element.hasAttribute("data-tank-total")) {
        element.disabled = true;
        return;
      }
      element.disabled = !enabled;
      if (!enabled && !element.hasAttribute("readonly")) {
        element.value = "";
      }
    });

    createTankRows(tankType, 0);
    const totalInput = section.querySelector(`[data-tank-total='${tankType}']`);
    if (totalInput) {
      totalInput.value = "";
    }
  };

  const syncTankSectionsFromSeaf = () => {
    const householdId = selectedHouseholdIdInput ? selectedHouseholdIdInput.value.trim() : "";
    const responses = readSeafResponses();
    const facilities = responses[householdId]?.facilities || [];

    setTankSectionState("underground", facilities.includes("Underground tank"));
    setTankSectionState("overhead", facilities.includes("Overhead tank"));
  };

  const syncEngineerOptions = () => {
    const householdId = selectedHouseholdIdInput ? selectedHouseholdIdInput.value.trim() : "";
    const city = getHouseholdCity(householdId);
    const staff = getStaffByCity(city);

    populateSelectOptions(engineerSelect, "Select engineer", staff.engineers);
  };

  const applyEngineeringDefaults = async () => {
    const householdId = selectedHouseholdIdInput ? selectedHouseholdIdInput.value.trim() : "";
    if (!householdId) {
      return;
    }

    const householdRecord = await hydrateHouseholdRecordFromBackend(householdId);
    const engineeringPayload = await getFormSubmissionFromBackend("engineering", householdId);
    const source = engineeringPayload && typeof engineeringPayload === "object"
      ? engineeringPayload
      : householdRecord && typeof householdRecord === "object"
        ? householdRecord
        : null;

    if (!source) {
      return;
    }

    if (housingWidthInput && !housingWidthInput.value && source.housingWidth) {
      housingWidthInput.value = source.housingWidth;
    }

    if (housingDepthInput && !housingDepthInput.value && source.housingDepth) {
      housingDepthInput.value = source.housingDepth;
    }

    if (waterNeedHouseholdSizeInput && !waterNeedHouseholdSizeInput.value && source.waterNeedHouseholdSize) {
      waterNeedHouseholdSizeInput.value = source.waterNeedHouseholdSize;
    }

    const savedCatchmentRows = Array.isArray(source.catchmentRows) ? source.catchmentRows : [];
    savedCatchmentRows.forEach((savedRow, index) => {
      const row = catchmentRows[index];
      if (!row || !savedRow || typeof savedRow !== "object") {
        return;
      }

      const widthInput = row.querySelector("[data-catchment-width]");
      const lengthInput = row.querySelector("[data-catchment-length]");

      if (widthInput && !widthInput.value && savedRow.width) {
        widthInput.value = savedRow.width;
      }

      if (lengthInput && !lengthInput.value && savedRow.length) {
        lengthInput.value = savedRow.length;
      }

      syncCatchmentRow(row);
    });

    const savedTankCounts = source.formState?.meta?.tankCounts || {};
    tankCountInputs.forEach((input) => {
      const tankType = input.dataset.tankCount;
      const savedCount = Math.max(0, Number.parseInt(String(savedTankCounts[tankType] || "0"), 10) || 0);
      input.value = savedCount > 0 ? String(savedCount) : "";
      createTankRows(tankType, savedCount);
      syncTankTotals(tankType);
    });

    if (source.formState) {
      restoreFormState(engineeringForm, source.formState);
    }

    if (housingAreaInput && !housingAreaInput.value && source.housingArea) {
      housingAreaInput.value = source.housingArea;
    }

    if (catchmentTotalAreaInput && !catchmentTotalAreaInput.value && source.catchmentTotalArea) {
      catchmentTotalAreaInput.value = source.catchmentTotalArea;
    }

    syncHousingStructureArea();
    syncCatchmentTotalArea();
    syncWaterNeedCalculations();
    syncEngineerOptions();
    setSelectValue(engineerSelect, source.engineerName || householdRecord?.engineerName || "");
    toggleCheckboxes.forEach((checkbox) => {
      syncToggleField(checkbox);
    });
    Array.from(engineeringForm.querySelectorAll("[data-generated-tank-row]")).forEach((row) => {
      const tankType = row.dataset.generatedTankRow;
      syncTankRow(row, tankType);
    });

    if (housingAreaInput && !housingAreaInput.value && source.housingArea) {
      housingAreaInput.value = source.housingArea;
    }

    if (catchmentTotalAreaInput && !catchmentTotalAreaInput.value && source.catchmentTotalArea) {
      catchmentTotalAreaInput.value = source.catchmentTotalArea;
    }

    if (waterNeedAreaInput && !waterNeedAreaInput.value && source.waterNeedArea) {
      waterNeedAreaInput.value = source.waterNeedArea;
    }

    if (waterNeedSpaceInput && !waterNeedSpaceInput.value && source.waterNeedSpace) {
      waterNeedSpaceInput.value = source.waterNeedSpace;
    }

    if (waterNeedQuantityInput && !waterNeedQuantityInput.value && source.waterNeedQuantity) {
      waterNeedQuantityInput.value = source.waterNeedQuantity;
    }

    if (waterNeedDailyInput && !waterNeedDailyInput.value && source.waterNeedDaily) {
      waterNeedDailyInput.value = source.waterNeedDaily;
    }

    if (waterNeedStorageInput && !waterNeedStorageInput.value && source.engineeringTankSpace) {
      waterNeedStorageInput.value = source.engineeringTankSpace;
    }
  };

    tankCountInputs.forEach((input) => {
      input.addEventListener("input", () => {
        const tankType = input.dataset.tankCount;
        const count = Math.max(0, Number.parseInt(input.value || "0", 10));
        createTankRows(tankType, count);
        syncTankTotals(tankType);
      });
    });

    if (waterNeedHouseholdSizeInput) {
      waterNeedHouseholdSizeInput.addEventListener("input", syncWaterNeedCalculations);
    }

    engineeringForm.addEventListener("input", (event) => {
      const row = event.target.closest("[data-generated-tank-row]");
      if (!row) {
        return;
      }

    const tankType = row.dataset.generatedTankRow;
    syncTankRow(row, tankType);
    });

    syncTankSectionsFromSeaf();
    syncHousingStructureArea();
    syncEngineerOptions();
    syncWaterNeedCalculations();
    void applyEngineeringDefaults();

  if (engineeringSubmitButton) {
    engineeringSubmitButton.addEventListener("click", async () => {
      if (!hasAtLeastOneCatchmentRow()) {
        if (engineeringFeedback) {
          engineeringFeedback.textContent = "Please fill at least one catchment area row before submitting the engineering form.";
          engineeringFeedback.classList.add("form-feedback-error");
          engineeringFeedback.classList.remove("form-feedback-success");
        }
        return;
      }

      const shouldSubmitEngineering = await openSubmissionPreview({
        title: "Engineering Assessment Preview",
        lead: "Review the engineering assessment details before submitting.",
        entries: buildPreviewEntriesFromForm(engineeringForm),
      });

      if (!shouldSubmitEngineering) {
        return;
      }

      const householdId = selectedHouseholdIdInput ? selectedHouseholdIdInput.value.trim() : "";
      const engineerName = engineerSelect ? engineerSelect.value.trim() : "";
      const catchmentTotalArea = catchmentTotalAreaInput ? catchmentTotalAreaInput.value.trim() : "";
      const catchmentRowPayload = catchmentRows
        .map((row) => ({
          width: row.querySelector("[data-catchment-width]")?.value.trim() || "",
          length: row.querySelector("[data-catchment-length]")?.value.trim() || "",
          area: row.querySelector("[data-catchment-area]")?.value.trim() || "",
        }))
        .filter((row) => row.width || row.length || row.area);
      const engineeringPayload = {
        engineerName,
        formState: serializeFormState(engineeringForm, {
          tankCounts: tankCountInputs.reduce((accumulator, input) => {
            accumulator[input.dataset.tankCount] = input.value || "0";
            return accumulator;
          }, {}),
        }),
        housingWidth: housingWidthInput?.value.trim() || "",
        housingDepth: housingDepthInput?.value.trim() || "",
        catchmentRows: catchmentRowPayload,
        catchmentTotalArea,
        housingArea: housingAreaInput?.value || "",
        engineeringCatchmentArea: catchmentTotalArea,
        engineeringCatchmentTotalArea: catchmentTotalArea,
        waterNeedArea: engineeringForm.querySelector("[data-water-need-area]")?.value || "",
        waterNeedSpace: engineeringForm.querySelector("[data-water-need-space]")?.value || "",
        waterNeedQuantity: engineeringForm.querySelector("[data-water-need-quantity]")?.value || "",
        waterNeedHouseholdSize: waterNeedHouseholdSizeInput?.value || "",
        waterNeedDaily: waterNeedDailyInput?.value || "",
        proposedStorageCapacity: engineeringForm.querySelector("[data-proposed-storage-capacity]")?.value || "",
        engineeringTankSpace: engineeringForm.querySelector("[data-water-need-storage]")?.value || "",
        tableRow: getEngineeringTableRow({
          form: engineeringForm,
          engineerName,
          catchmentRows,
          catchmentTotalAreaInput,
          housingWidthInput,
          housingDepthInput,
          housingAreaInput,
          waterNeedAreaInput,
          waterNeedSpaceInput,
          waterNeedQuantityInput,
          waterNeedHouseholdSizeInput,
          waterNeedDailyInput,
          waterNeedStorageInput,
        }),
      };

      try {
        await setSubmittedFormStatus(householdId, "engineering", "Submitted", {
          payload: engineeringPayload,
          householdPatch: {
            engineerName,
            housingWidth: engineeringPayload.housingWidth,
            housingDepth: engineeringPayload.housingDepth,
            housingArea: engineeringPayload.housingArea,
            catchmentRows: engineeringPayload.catchmentRows,
            engineeringCatchmentArea: catchmentTotalArea,
            engineeringCatchmentTotalArea: catchmentTotalArea,
            waterNeedArea: engineeringPayload.waterNeedArea,
            waterNeedSpace: engineeringPayload.waterNeedSpace,
            waterNeedQuantity: engineeringPayload.waterNeedQuantity,
            waterNeedHouseholdSize: engineeringPayload.waterNeedHouseholdSize,
            waterNeedDaily: engineeringPayload.waterNeedDaily,
            engineeringTankSpace: engineeringPayload.engineeringTankSpace,
            proposedStorageCapacity: engineeringPayload.proposedStorageCapacity,
          },
        });
      } catch (error) {
        // Keep the local save and continue with the existing UX.
      }

      try {
        sessionStorage.setItem(postRedirectMessageKey, "The Engineering form is submitted successfully.");
      } catch (error) {
        // Ignore sessionStorage errors.
      }

      window.location.href = "index.html";
    });
  }
}

const householdForm = document.querySelector("[data-household-form]");

if (householdForm) {
  const tabs = Array.from(document.querySelectorAll("[data-step-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-step-panel]"));
  const continueButton = document.querySelector("[data-household-continue]");
  const feedback = document.querySelector("[data-form-feedback]");
  const inlineEligibilityMessage = document.querySelector("[data-eligibility-inline-message]");
  const householdIdInput = document.querySelector("[data-household-id]");
  const surveyDateInput = document.querySelector("[data-survey-date]");
  const householdLocationInput = document.querySelector("[data-household-location]");
  const enumeratorSelect = document.querySelector("[data-enumerator-select]");
  const citySelect = document.querySelector("[data-city-select]");
  const ucncSelect = document.querySelector("[data-ucnc-select]");
  const catchmentAreaInput = document.querySelector("[data-catchment-area]");
  const tankSpaceSelect = document.querySelector("[data-tank-space]");
  const interviewAddressInput = document.querySelector("[data-interview-address]");
  const respondantGenderInput = document.querySelector("[data-respondant-gender]");
  const respondantPhoneInput = document.querySelector("[data-respondant-phone]");
  const respondantHeadSelect = document.querySelector("[data-respondant-head-select]");
  const headInfoSection = document.querySelector("[data-head-info-section]");
  const respondantDetailsSection = document.querySelector("[data-respondant-details-section]");
  const relationshipToHeadField = document.querySelector("[data-relationship-to-head-field]");
  const relationshipToHeadInput = document.querySelector("[data-relationship-to-head]");
  const relationshipOtherField = document.querySelector("[data-relationship-other-field]");
  const relationshipOtherInput = document.querySelector("[data-relationship-other]");
  const headCnicInput = document.querySelector("[data-head-cnic]");
  const headNameInput = document.querySelector("[data-head-name]");
  const respondantCnicInput = document.querySelector("[data-respondant-cnic]");
  const respondantNameInput = document.querySelector("[data-respondant-name]");
  const respondantAgeInput = document.querySelector("[data-respondant-age]");

  const generatedIdsStorageKey = "shehersaaz-generated-household-ids";
  const interviewAreas = {
    Rawalpindi: ["UC 1", "UC 2", "UC 4", "UC 5", "UC 6", "UC 12", "UC 37"],
    Nowshera: [
      "Dehri Khel",
      "Allah Yar Khel",
      "Nawa Kali",
      "Shahmeer Gari",
      "Bara Khel",
      "Behram Khan Khel",
      "Mana Khel",
      "Kabul River"
    ]
  };
  let toastTimeoutId;
  let isFetchingHouseholdLocation = false;

  const getHouseholdAssessmentSnapshot = (eligibilityStatus = "") => {
    const householdId = householdIdInput?.value.trim() || "";
    const surveyDate = surveyDateInput?.value || "";
    const householdLocation = householdLocationInput?.value.trim() || "";
    const city = citySelect?.value || "";
    const ucnc = ucncSelect?.value || "";
    const address = interviewAddressInput?.value.trim() || "";
    const catchmentArea = catchmentAreaInput?.value || "";
    const tankSpace = tankSpaceSelect?.value || "";
    const enumeratorName = enumeratorSelect?.value || "";
    const headName = respondantHeadSelect?.value === "No"
      ? headNameInput?.value.trim() || ""
      : respondantNameInput?.value.trim() || "";
    const respondentName = respondantNameInput?.value.trim() || "";
    const respondentCnic = respondantCnicInput?.value.trim() || "";
    const headCnic = headCnicInput?.value.trim() || "";
    const respondentGender = respondantGenderInput?.value || "";
    const respondentPhoneNumber = respondantPhoneInput?.value.trim() || "";
    const respondentAge = respondantAgeInput?.value || "";
    const respondentIsHouseholdHead = respondantHeadSelect?.value || "";
    const relationshipToHead = relationshipToHeadInput?.value || "";
    const tableRow = getHouseholdInfoTableRow({
      householdId,
      surveyDate,
      householdLocation,
      city,
      ucnc,
      interviewAddress: address,
      enumeratorName,
      catchmentArea,
      tankSpace,
      eligibilityStatus,
      respondentIsHouseholdHead,
      householdHeadCnic: headCnic,
      householdHeadName: headName,
      relationshipToHead,
      respondentCnic,
      respondentName,
      respondentPhoneNumber,
      respondentGender,
      respondentAge,
    });

    return {
      householdId,
      surveyDate,
      householdLocation,
      city,
      ucnc,
      address,
      catchmentArea,
      tankSpace,
      enumeratorName,
      respondentIsHouseholdHead,
      relationshipToHead,
      headName,
      respondentName,
      respondentCnic,
      headCnic,
      respondentGender,
      respondentPhoneNumber,
      respondentAge,
      eligibilityStatus,
      tableRow,
    };
  };

  const showFloatingMessage = (message, options = {}) => {
    let toast = document.querySelector("[data-floating-message]");
    let toastText;
    let toastAction;

    if (!toast) {
      toast = document.createElement("div");
      toast.className = "floating-message";
      toast.dataset.floatingMessage = "true";
      toast.innerHTML = `
        <p class="floating-message__text" data-floating-message-text></p>
        <a class="floating-message__action" data-floating-message-action href="index.html" hidden>Back to Home</a>
      `;
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.append(toast);
    }

    toastText = toast.querySelector("[data-floating-message-text]");
    toastAction = toast.querySelector("[data-floating-message-action]");

    if (toastText) {
      toastText.textContent = message;
    }

    if (toastAction) {
      toastAction.hidden = !options.showHomeAction;
    }

    toast.classList.add("is-visible");
    toast.classList.toggle("floating-message-with-action", Boolean(options.showHomeAction));

    if (toastTimeoutId) {
      window.clearTimeout(toastTimeoutId);
    }

    if (!options.persistent) {
      toastTimeoutId = window.setTimeout(() => {
        toast.classList.remove("is-visible");
      }, 2600);
    }
  };

  const formatGeolocationError = (error) => {
    if (!error) {
      return "Unable to fetch the current location.";
    }

    switch (error.code) {
      case error.PERMISSION_DENIED:
        return "Location access was denied. Please allow browser location permission and try again.";
      case error.POSITION_UNAVAILABLE:
        return "Current location is unavailable right now. Please try again.";
      case error.TIMEOUT:
        return "Fetching the current location timed out. Please try again.";
      default:
        return "Unable to fetch the current location.";
    }
  };

  const captureCurrentHouseholdLocation = () => {
    if (!householdLocationInput || isFetchingHouseholdLocation) {
      return;
    }

    if (!("geolocation" in navigator)) {
      showFloatingMessage("This browser does not support location access.");
      return;
    }

    isFetchingHouseholdLocation = true;
    const previousValue = householdLocationInput.value;
    householdLocationInput.value = "Fetching current coordinates...";
    householdLocationInput.setAttribute("aria-busy", "true");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude).toFixed(6);
        const longitude = Number(position.coords.longitude).toFixed(6);
        householdLocationInput.value = `${latitude}, ${longitude}`;
        householdLocationInput.removeAttribute("aria-busy");
        isFetchingHouseholdLocation = false;
        showFloatingMessage("Current coordinates captured successfully.");
      },
      (error) => {
        householdLocationInput.value = previousValue;
        householdLocationInput.removeAttribute("aria-busy");
        isFetchingHouseholdLocation = false;
        showFloatingMessage(formatGeolocationError(error), { persistent: true });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const readGeneratedIds = () => {
    try {
      const storedIds = localStorage.getItem(generatedIdsStorageKey);
      const parsedIds = storedIds ? JSON.parse(storedIds) : [];
      return Array.isArray(parsedIds) ? parsedIds : [];
    } catch (error) {
      return [];
    }
  };

  const writeGeneratedIds = (ids) => {
    localStorage.setItem(generatedIdsStorageKey, JSON.stringify(ids));
  };

  const generateCodeSegment = () => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const bytes = new Uint8Array(3);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  };

  const generateUniqueHouseholdId = () => {
    const existingIds = new Set(readGeneratedIds());
    let householdId = "";

    do {
      householdId = `RWHU-${generateCodeSegment()}-${generateCodeSegment()}`;
    } while (existingIds.has(householdId));

    existingIds.add(householdId);
    writeGeneratedIds(Array.from(existingIds));
    return householdId;
  };

  if (householdIdInput && !householdIdInput.value) {
    householdIdInput.value = generateUniqueHouseholdId();
  }

  if (surveyDateInput && !surveyDateInput.value) {
    const today = new Date();
    const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
    surveyDateInput.value = localDate.toISOString().split("T")[0];
  }

  if (enumeratorSelect) {
    enumeratorSelect.innerHTML = '<option value="" selected disabled hidden>Select CMO</option>';
  }

  const populateStaffOptions = () => {
    if (!enumeratorSelect) {
      return;
    }

    const selectedCity = citySelect?.value || "";
    const staffSet = getStaffByCity(selectedCity);

    if (enumeratorSelect) {
      enumeratorSelect.innerHTML = '<option value="" selected disabled hidden>Select CMO</option>';
      staffSet.cmos.forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        enumeratorSelect.append(option);
      });
      enumeratorSelect.value = "";
    }
  };

  const syncInterviewAreas = () => {
    if (!citySelect || !ucncSelect) {
      return;
    }

    const selectedCity = citySelect.value;
    const placeholderLabel = selectedCity === "Rawalpindi"
      ? "Select UC"
      : selectedCity === "Nowshera"
        ? "Select NC"
        : "Select UC/NC";
    const areas = interviewAreas[selectedCity] || [];

    ucncSelect.innerHTML = "";

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = placeholderLabel;
    placeholderOption.disabled = true;
    placeholderOption.hidden = true;
    placeholderOption.selected = true;
    ucncSelect.append(placeholderOption);

    areas.forEach((area) => {
      const option = document.createElement("option");
      option.value = area;
      option.textContent = area;
      ucncSelect.append(option);
    });

    ucncSelect.value = "";
    ucncSelect.selectedIndex = 0;
  };

  if (citySelect) {
    citySelect.addEventListener("change", syncInterviewAreas);
    citySelect.addEventListener("change", populateStaffOptions);
    syncInterviewAreas();
    populateStaffOptions();
  }

  if (householdLocationInput) {
    householdLocationInput.addEventListener("click", captureCurrentHouseholdLocation);
    householdLocationInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        captureCurrentHouseholdLocation();
      }
    });
  }

  const formatCnicValue = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 13);
    const firstPart = digits.slice(0, 5);
    const secondPart = digits.slice(5, 12);
    const thirdPart = digits.slice(12, 13);

    let formattedValue = firstPart;

    if (secondPart) {
      formattedValue += `-${secondPart}`;
    }

    if (thirdPart) {
      formattedValue += `-${thirdPart}`;
    }

    return formattedValue;
  };

  if (respondantCnicInput) {
    respondantCnicInput.addEventListener("input", () => {
      respondantCnicInput.value = formatCnicValue(respondantCnicInput.value);
      if (respondantGenderInput) {
        respondantGenderInput.value = getGenderFromCnic(respondantCnicInput.value);
      }
    });
  }

  if (respondantPhoneInput) {
    const syncPhoneValidity = () => {
      const digits = respondantPhoneInput.value.replace(/\D/g, "").slice(0, 11);
      respondantPhoneInput.value = digits;
      if (digits.length !== 11) {
        respondantPhoneInput.setCustomValidity("Phone number must be exactly 11 digits.");
      } else {
        respondantPhoneInput.setCustomValidity("");
      }
    };

    respondantPhoneInput.addEventListener("input", syncPhoneValidity);
    respondantPhoneInput.addEventListener("blur", syncPhoneValidity);
  }

  if (headCnicInput) {
    headCnicInput.addEventListener("input", () => {
      headCnicInput.value = formatCnicValue(headCnicInput.value);
    });
  }

  const syncRelationshipOtherField = () => {
    return;
  };

  const syncRespondantSections = () => {
    if (!respondantHeadSelect || !respondantDetailsSection) {
      return;
    }

    const isNotHead = respondantHeadSelect.value === "No";

    respondantDetailsSection.hidden = !respondantHeadSelect.value;

    if (headInfoSection) {
      headInfoSection.hidden = !isNotHead;
    }

    if (relationshipToHeadField) {
      relationshipToHeadField.hidden = !isNotHead;
    }

    if (relationshipToHeadInput) {
      relationshipToHeadInput.required = isNotHead;
      if (!isNotHead) {
        relationshipToHeadInput.value = "";
      }
    }

    if (headCnicInput) {
      headCnicInput.required = isNotHead;
      if (!isNotHead) {
        headCnicInput.value = "";
      }
    }

    if (headNameInput) {
      headNameInput.required = isNotHead;
      if (!isNotHead) {
        headNameInput.value = "";
      }
    }

    syncRelationshipOtherField();
  };

  if (respondantHeadSelect) {
    respondantHeadSelect.addEventListener("change", syncRespondantSections);
    syncRespondantSections();
  }

  if (relationshipToHeadInput) {
    relationshipToHeadInput.addEventListener("change", syncRelationshipOtherField);
    syncRelationshipOtherField();
  }

  const setActiveStep = (stepName) => {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.stepTab === stepName;
      tab.classList.toggle("is-active", isActive);
      tab.classList.toggle("is-complete", !isActive && stepName === "respondant" && tab.dataset.stepTab === "household");
    });

    panels.forEach((panel) => {
      const isActive = panel.dataset.stepPanel === stepName;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });

    if (continueButton) {
      continueButton.textContent = stepName === "respondant" ? "Submit" : "Continue";
    }
  };

  const getActivePanel = () => panels.find((panel) => panel.classList.contains("is-active"));

  const clearFieldError = (field) => {
    field.classList.remove("field-error");
    const input = field.querySelector("input, select, textarea");
    if (input) {
      input.removeAttribute("aria-invalid");
    }
  };

  const markFieldError = (field) => {
    field.classList.add("field-error");
    const input = field.querySelector("input, select, textarea");
    if (input) {
      input.setAttribute("aria-invalid", "true");
    }
  };

  const validatePanel = (panel) => {
    const invalidFields = [];
    const requiredFields = Array.from(panel.querySelectorAll(".field")).filter((field) => {
      if (field.closest("[hidden]")) {
        return false;
      }
      const input = field.querySelector("input[required], select[required], textarea[required]");
      return Boolean(input) || field.querySelector("[data-radio-group]");
    });

    requiredFields.forEach((field) => {
      clearFieldError(field);

      const input = field.querySelector("input[required], select[required], textarea[required]");
      const radioGroup = field.querySelector("[data-radio-group]");

      if (radioGroup) {
        const checked = radioGroup.querySelector("input[type='radio']:checked");
        if (!checked) {
          markFieldError(field);
          invalidFields.push(field);
        }
        return;
      }

      if (input && !input.checkValidity()) {
        markFieldError(field);
        invalidFields.push(field);
      }
    });

    return invalidFields;
  };

  const getEligibilityResult = () => {
    const catchmentArea = catchmentAreaInput ? catchmentAreaInput.value : "";
    const tankSpace = tankSpaceSelect ? tankSpaceSelect.value : "";
    const isEligible = catchmentArea === "Yes" && tankSpace === "Yes";

    return {
      isEligible,
      message: isEligible
        ? "This household is eligible for Rainwater Harvesting Unit installation."
        : "This household is not eligible for Rainwater Harvesting Unit installation."
    };
  };

  const saveEligibleHousehold = () => {
    if (!householdIdInput) {
      return;
    }

    const headName = respondantHeadSelect?.value === "No"
      ? headNameInput?.value.trim()
      : respondantNameInput?.value.trim();

    if (!headName) {
      return;
    }

    try {
      const storedHouseholds = localStorage.getItem(eligibleHouseholdsStorageKey);
      const parsedHouseholds = storedHouseholds ? JSON.parse(storedHouseholds) : [];
      const households = Array.isArray(parsedHouseholds) ? parsedHouseholds : [];
      const record = {
        householdId: householdIdInput.value,
        headName
      };
      const existingIndex = households.findIndex((household) => household.householdId === record.householdId);

      if (existingIndex >= 0) {
        households[existingIndex] = record;
      } else {
        households.unshift(record);
      }

      localStorage.setItem(eligibleHouseholdsStorageKey, JSON.stringify(households));
    } catch (error) {
      // Ignore localStorage errors so submission is not blocked.
    }
  };

  const saveHouseholdAssessmentRecord = (eligibilityStatus) => {
    if (!householdIdInput) {
      return;
    }

    const householdId = householdIdInput.value.trim();
    if (!householdId) {
      return;
    }

    const householdPatch = {
      ...getHouseholdAssessmentSnapshot(eligibilityStatus),
      status: eligibilityStatus,
      cmoName: enumeratorSelect?.value || "",
      stageStatus: readSubmittedForms()[householdId] || {},
    };

    upsertHouseholdRecord(householdId, householdPatch);
    return queueBackendSync("/api/forms/household/submit", {
      householdId,
      payload: householdPatch,
      householdPatch,
      status: "Submitted",
      headName: householdPatch.headName || "",
    });
  };

  const openRespondantStep = () => {
    setActiveStep("respondant");
    if (inlineEligibilityMessage) {
      inlineEligibilityMessage.hidden = false;
    }
    if (feedback) {
      feedback.textContent = "Fields marked with an asterisk (*) are required.";
      feedback.classList.remove("form-feedback-error", "form-feedback-success");
    }
    const nextInput = document.querySelector("[data-step-panel='respondant'] input, [data-step-panel='respondant'] select");
    if (nextInput) {
      nextInput.focus();
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.stepTab === "respondant") {
        const householdPanel = document.querySelector("[data-step-panel='household']");
        if (householdPanel) {
          const invalidFields = validatePanel(householdPanel);
          if (invalidFields.length > 0) {
            if (feedback) {
              feedback.textContent = "Please fill the Household Information section before continuing to Respondant Information.";
              feedback.classList.add("form-feedback-error");
              feedback.classList.remove("form-feedback-success");
            }
            showFloatingMessage("Please fill the Household Information section to continue to Respondant Information.");
            return;
          }
        }

        const eligibilityResult = getEligibilityResult();
        if (eligibilityResult.isEligible) {
          saveHouseholdAssessmentRecord("passed");
          openRespondantStep();
          return;
        }

        saveHouseholdAssessmentRecord("failed");
        removeEligibleHousehold(householdIdInput?.value.trim() || "");
        if (feedback) {
          feedback.textContent = eligibilityResult.message;
          feedback.classList.add("form-feedback-error");
          feedback.classList.remove("form-feedback-success");
        }
        showFloatingMessage(eligibilityResult.message, { persistent: true, showHomeAction: true });
        return;
      }

      setActiveStep(tab.dataset.stepTab);
      if (tab.dataset.stepTab !== "respondant" && inlineEligibilityMessage) {
        inlineEligibilityMessage.hidden = true;
      }
      if (feedback) {
        feedback.textContent = "Fields marked with an asterisk (*) are required.";
        feedback.classList.remove("form-feedback-error", "form-feedback-success");
      }
    });
  });

  householdForm.addEventListener("input", (event) => {
    const field = event.target.closest(".field");
    if (field) {
      clearFieldError(field);
    }
  });

  householdForm.addEventListener("change", (event) => {
    const field = event.target.closest(".field");
    if (field) {
      clearFieldError(field);
    }
  });

  if (continueButton) {
    continueButton.addEventListener("click", async () => {
      const activePanel = getActivePanel();
      if (!activePanel) {
        return;
      }

      const invalidFields = validatePanel(activePanel);

      if (invalidFields.length > 0) {
        if (feedback) {
          feedback.textContent = "Please fill in the required fields highlighted below.";
          feedback.classList.add("form-feedback-error");
          feedback.classList.remove("form-feedback-success");
        }
        const firstInput = invalidFields[0].querySelector("input, select, textarea");
        if (firstInput) {
          firstInput.focus();
        }
        return;
      }

      if (activePanel.dataset.stepPanel === "household") {
        const eligibilityResult = getEligibilityResult();
        if (eligibilityResult.isEligible) {
          try {
            await saveHouseholdAssessmentRecord("passed");
          } catch (error) {
            // Keep the local save and allow the user to continue.
          }
          openRespondantStep();
          return;
        }

        try {
          await saveHouseholdAssessmentRecord("failed");
        } catch (error) {
          // Keep the local save and continue to show the eligibility result.
        }
        removeEligibleHousehold(householdIdInput?.value.trim() || "");
        if (feedback) {
          feedback.textContent = eligibilityResult.message;
          feedback.classList.add("form-feedback-error");
          feedback.classList.remove("form-feedback-success");
        }
        showFloatingMessage(eligibilityResult.message, { persistent: true, showHomeAction: true });
        return;
      }

      if (feedback) {
        const shouldSubmitHousehold = await openSubmissionPreview({
          title: "Household Information Preview",
          lead: "Review the household and respondent details before submitting.",
          entries: buildPreviewEntriesFromForm(householdForm),
        });

        if (!shouldSubmitHousehold) {
          return;
        }

        saveEligibleHousehold();
        try {
          await saveHouseholdAssessmentRecord("passed");
        } catch (error) {
          feedback.textContent = "Household information was saved locally, but the backend/database save did not complete yet.";
          feedback.classList.add("form-feedback-error");
          feedback.classList.remove("form-feedback-success");
          return;
        }
        feedback.textContent = "Respondant Information submitted successfully.";
        feedback.classList.add("form-feedback-success");
        feedback.classList.remove("form-feedback-error");
      }
      window.location.href = "index.html";
    });
  }
}
