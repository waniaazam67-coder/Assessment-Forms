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

const getHouseholdRecordById = (householdId) => {
  if (!householdId) {
    return null;
  }

  const records = readHouseholdRecords();
  return records.find((record) => record?.householdId === householdId) || null;
};

const upsertHouseholdRecord = (householdId, patch = {}) => {
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

const getEngineeringCatchmentAreaForHousehold = (householdId) => {
  const record = getHouseholdRecordById(householdId);
  const rawArea = record?.engineeringCatchmentTotalArea || record?.engineeringCatchmentArea || "";
  const area = Number.parseFloat(String(rawArea).replace(/,/g, ""));
  return Number.isFinite(area) ? area : 0;
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

const setSubmittedFormStatus = (householdId, formKey, status = "Submitted") => {
  if (!householdId) {
    return;
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
  upsertHouseholdRecord(householdId, {
    headName: currentHeadName || existing.headName || "",
    stageStatus: {
      seaf: submittedForms[householdId].seaf,
      engineering: submittedForms[householdId].engineering,
      inventory: submittedForms[householdId].inventory,
    },
  });

  if (isHouseholdFullySubmitted(submittedForms[householdId])) {
    removeEligibleHousehold(householdId);
  }
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
  const showHouseholdPicker = (targetHref) => {
    let picker = document.querySelector("[data-household-picker]");
    let pickerList;
    const households = readEligibleHouseholds();

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
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showHouseholdPicker(link.href);
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
const inventoryPalletSpecInput = document.querySelector("[data-inventory-pallet-spec]");
const inventoryAddOtherItemButton = document.querySelector("[data-add-other-item]");
const inventoryOtherItemsList = document.querySelector("[data-other-items-list]");
const inventoryQuantityInputs = Array.from(document.querySelectorAll("[data-inventory-quantity]"));
const inventorySelectInputs = Array.from(document.querySelectorAll("[data-inventory-select]"));

if (selectedHouseholdSummary || selectedHouseholdIdInput || selectedHouseholdNameInput) {
  try {
    const storedHousehold = sessionStorage.getItem(selectedHouseholdStorageKey);
    const selectedHousehold = storedHousehold ? JSON.parse(storedHousehold) : null;

    if (selectedHousehold) {
      if (selectedHouseholdSummary) {
        selectedHouseholdSummary.hidden = false;
        selectedHouseholdSummary.textContent = `Selected household: ${selectedHousehold.householdId} - ${selectedHousehold.headName}`;
      }

      if (selectedHouseholdIdInput && !selectedHouseholdIdInput.value) {
        selectedHouseholdIdInput.value = selectedHousehold.householdId || "";
      }

      if (selectedHouseholdNameInput && !selectedHouseholdNameInput.value) {
        selectedHouseholdNameInput.value = selectedHousehold.headName || "";
      }
    }
  } catch (error) {
    // Ignore sessionStorage parsing errors.
  }
}

if (inventoryForm) {
  const inventorySubmitButton = document.querySelector("[data-inventory-submit]");
  let otherItemCount = 0;

  const createOtherItemCard = () => {
    otherItemCount += 1;
    const card = document.createElement("section");
    card.className = "inventory-question-card";
    card.innerHTML = `
      <h4 class="inventory-other-item-title">Other item ${otherItemCount}</h4>
      <label class="field">
        <span>Item name</span>
        <input type="text" placeholder="Enter item name">
      </label>
      <label class="field">
        <span>Quantity</span>
        <input type="number" min="0" step="1" value="1" data-inventory-quantity data-default-quantity="1">
      </label>
    `;
    return card;
  };

  const applyInventoryDefaults = () => {
    const householdId = selectedHouseholdIdInput ? selectedHouseholdIdInput.value.trim() : "";
    const catchmentArea = getEngineeringCatchmentAreaForHousehold(householdId);
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

    const selectedTankSize = inventoryWaterTankSelect ? inventoryWaterTankSelect.value : recommendedTankSize;

    if (inventoryPalletSpecInput) {
      inventoryPalletSpecInput.value = getPalletSpecForTank(selectedTankSize);
    }

    inventoryQuantityInputs.forEach((input) => {
      if (!input.value) {
        input.value = input.dataset.defaultQuantity || "1";
      }
    });

    inventorySelectInputs.forEach((select) => {
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

  applyInventoryDefaults();

  if (inventoryWaterTankSelect) {
    inventoryWaterTankSelect.addEventListener("change", () => {
      if (inventoryPalletSpecInput) {
        inventoryPalletSpecInput.value = getPalletSpecForTank(inventoryWaterTankSelect.value);
      }
    });
  }

  if (inventoryAddOtherItemButton && inventoryOtherItemsList) {
    inventoryAddOtherItemButton.addEventListener("click", () => {
      inventoryOtherItemsList.hidden = false;
      inventoryOtherItemsList.append(createOtherItemCard());
    });
  }

  if (inventorySubmitButton) {
    inventorySubmitButton.addEventListener("click", () => {
      const householdId = selectedHouseholdIdInput ? selectedHouseholdIdInput.value.trim() : "";

      if (!householdId) {
        if (inventoryFeedback) {
          inventoryFeedback.textContent = "Please select a household before submitting the inventory form.";
          inventoryFeedback.classList.add("form-feedback-error");
          inventoryFeedback.classList.remove("form-feedback-success");
        }
        return;
      }

      setSubmittedFormStatus(householdId, "inventory");

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
    responses[householdId] = {
      ...(responses[householdId] || {}),
      facilities: facilities.length > 0 ? facilities : facilityChecks,
      utilities: utilityChecks,
    };
    writeSeafResponses(responses);
    upsertHouseholdRecord(householdId, {
      seafFacilities: facilities.length > 0 ? facilities : facilityChecks,
      seafUtilities: utilityChecks,
    });
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

  if (socioContinueButton) {
    socioContinueButton.addEventListener("click", () => {
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
      saveSeafResponse();
      setSubmittedFormStatus(householdId, "seaf");

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
      if (!waterNeedAreaInput || !waterNeedSpaceInput || !waterNeedQuantityInput || !waterNeedDailyInput || !waterNeedStorageInput) {
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
      waterNeedDailyInput.value = Number.isFinite(householdSize) && householdSize > 0 ? dailyNeed.toFixed(2) : "";
      waterNeedStorageInput.value = Number.isFinite(householdSize) && householdSize > 0 ? storageNeed.toFixed(2) : "";
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

  if (engineeringSubmitButton) {
    engineeringSubmitButton.addEventListener("click", () => {
      if (!hasAtLeastOneCatchmentRow()) {
        if (engineeringFeedback) {
          engineeringFeedback.textContent = "Please fill at least one catchment area row before submitting the engineering form.";
          engineeringFeedback.classList.add("form-feedback-error");
          engineeringFeedback.classList.remove("form-feedback-success");
        }
        return;
      }

      const householdId = selectedHouseholdIdInput ? selectedHouseholdIdInput.value.trim() : "";
      const engineerName = engineerSelect ? engineerSelect.value.trim() : "";
      const catchmentTotalArea = catchmentTotalAreaInput ? catchmentTotalAreaInput.value.trim() : "";
      setSubmittedFormStatus(householdId, "engineering");
      upsertHouseholdRecord(householdId, {
        engineerName,
        engineeringCatchmentArea: catchmentTotalArea,
        engineeringCatchmentTotalArea: catchmentTotalArea,
        engineeringTankSpace: engineeringForm.querySelector("[data-water-need-storage]")?.value || "",
        proposedStorageCapacity: engineeringForm.querySelector("[data-proposed-storage-capacity]")?.value || "",
      });

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

  const getHouseholdAssessmentSnapshot = (eligibilityStatus = "") => {
    const surveyDate = surveyDateInput?.value || "";
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

    return {
      surveyDate,
      city,
      ucnc,
      address,
      catchmentArea,
      tankSpace,
      enumeratorName,
      headName,
      respondentName,
      respondentCnic,
      headCnic,
      respondentGender,
      eligibilityStatus,
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
    const isEligible = catchmentArea === "Yes";

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

    upsertHouseholdRecord(householdId, {
      ...getHouseholdAssessmentSnapshot(eligibilityStatus),
      householdId,
      status: eligibilityStatus,
      cmoName: enumeratorSelect?.value || "",
      stageStatus: readSubmittedForms()[householdId] || {},
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
    continueButton.addEventListener("click", () => {
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
          saveHouseholdAssessmentRecord("passed");
          openRespondantStep();
          return;
        }

        saveHouseholdAssessmentRecord("failed");
        if (feedback) {
          feedback.textContent = eligibilityResult.message;
          feedback.classList.add("form-feedback-error");
          feedback.classList.remove("form-feedback-success");
        }
        showFloatingMessage(eligibilityResult.message, { persistent: true, showHomeAction: true });
        return;
      }

      if (feedback) {
        saveEligibleHousehold();
        saveHouseholdAssessmentRecord("passed");
        feedback.textContent = "Respondant Information submitted successfully.";
        feedback.classList.add("form-feedback-success");
        feedback.classList.remove("form-feedback-error");
      }
      window.location.href = "index.html";
    });
  }
}
