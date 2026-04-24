const mysql = require("mysql2/promise");
const { db: dbConfig } = require("./config");

const bootstrapConfig = {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
};

const tableNames = {
  household: "household_info",
  seaf: "socio",
  socio: "socio",
  engineering: "engineering",
  inventory: "inventory",
  status: "assessment_status",
};

let pool;

const sharedIdentityColumns = [
  "household_id",
  "selected_household_name",
  "cnic",
  "respondent_cnic",
  "head_cnic",
];

const predefinedColumnsByTable = {
  household_info: [
    "household_id",
    "cnic",
    "respondent_cnic",
    "head_cnic",
    "survey_date",
    "household_location",
    "city",
    "ucnc",
    "interview_address",
    "enumerator_name",
    "catchment_area",
    "tank_space",
    "eligibility_status",
    "respondent_is_household_head",
    "household_head_name",
    "relationship_to_head",
    "respondent_name",
    "respondent_phone_number",
    "respondent_gender",
    "respondent_age",
  ],
  socio: [
    ...sharedIdentityColumns,
    "households_in_dwelling",
    "number_of_floors",
    "number_of_rooms",
    "electricity_source",
    "cooking_and_heating_fuel",
    "housing_structure_type",
    "roof_type",
    "household_members_count",
    "household_members_json",
    "selected_facilities_json",
    "selected_utilities_json",
    "water_quantity",
    "water_quality",
    "household_solid_waste_disposal",
    "street_sewers_type",
    "cleanliness_of_streets",
    "flooding_history",
    "basic_utility_landline",
    "basic_utility_electricity",
    "basic_utility_natural_gas",
    "facility_inside_house_toilet",
    "facility_inside_house_kitchen",
    "facility_inside_house_overhead_tank",
    "facility_inside_house_water_filter",
    "facility_inside_house_underground_tank",
    "facility_inside_house_sanitation",
    "facility_inside_house_sewer",
    "water_source_inside_house_municipal_water_supply",
    "water_source_inside_house_hand_pump",
    "water_source_inside_house_borehole",
    "water_source_inside_house_protected_well",
    "water_source_inside_house_unprotected_well",
    "water_source_inside_house_rwh",
    "water_source_inside_house_other",
    "water_source_outside_house_water_filteration_plant",
    "water_source_outside_house_water_vendor",
    "water_source_outside_house_from_neighbour",
    "water_source_outside_house_hand_pump",
    "water_source_outside_house_borehole",
    "water_source_outside_house_tube_well",
    "water_source_outside_house_canal_river_pond",
    "water_source_outside_house_spring",
    "water_source_outside_house_others",
    "street_greening_no_trees_in_the_street",
    "street_greening_no_plants_in_the_street",
    "street_greening_there_are_trees_in_the_street",
    "street_greening_there_are_plants_in_the_street",
    "street_greening_no_space_available_to_grow_trees_in_the_street",
    "street_greening_no_space_available_to_place_grow_plants_in_street",
    "street_greening_space_is_available_to_grow_trees",
    "street_greening_space_is_available_to_grow_place_plants_in_street",
    "house_greening_no_tree_s_in_the_house",
    "house_greening_no_plants_in_the_house",
    "house_greening_there_are_flower_plants_in_the_house",
    "house_greening_there_are_vegetable_plants_in_the_house",
    "house_greening_no_space_available_to_grow_trees_in_the_house",
    "house_greening_no_space_to_grow_vegetables_in_the_house",
    "house_greening_space_is_available_to_grow_trees_in_the_house",
    "house_greening_space_is_available_to_grow_place_plants_in_house",
    ...Array.from({ length: 10 }, (_, index) => `member_${index + 1}_gender`),
    ...Array.from({ length: 10 }, (_, index) => `member_${index + 1}_literacy_level`),
    ...Array.from({ length: 10 }, (_, index) => `member_${index + 1}_employment_status`),
  ],
  engineering: [
    ...sharedIdentityColumns,
    "engineer_name",
    "housing_width_ft",
    "housing_depth_ft",
    "housing_area_sq_ft",
    "total_catchment_area_sq_ft",
    "proposed_storage_capacity",
    "reasons_for_rejection",
    "water_need_area_a_sq_ft",
    "water_need_space_s_cubic_ft",
    "water_need_quantity_q_liters",
    "water_need_household_size",
    "water_need_daily_liters",
    "water_need_storage_liters",
    "roof_material_rcc_slab_lanter",
    "roof_material_prefabricated_rcc_slabs_t_iron_and_girder_beams",
    "roof_material_clay_bricks_tiles_t_iron_and_grinder_beams",
    "roof_material_any_other",
    "roof_material_other_text",
    "drainage_arrangement_rainwater_from_rooftop_balconies_terraces_and_shades_is_drained_separately_and_not_drained_into_sewerage_system",
    "drainage_arrangement_rainwater_is_not_drained_separately_and_is_drained_into_sewerage_system",
    "drainage_arrangement_other_arrangement",
    "drainage_arrangement_rainwater_is_drained_directly_into_street",
    "drainage_arrangement_rainwater_is_drained_into_courtyard_or_other_part_of_house",
    "drainage_arrangement_other_text",
    "catchment_rows_json",
    "underground_tank_count",
    "underground_tank_material",
    "underground_tank_total_capacity",
    "underground_tanks_json",
    "overhead_tank_count",
    "overhead_tank_material",
    "overhead_tank_total_capacity",
    "overhead_tanks_json",
  ],
  inventory: [
    ...sharedIdentityColumns,
    "catchment_area_from_engineering",
    "recommended_tank",
    "selected_tank_size_liters",
    "pallet_spec_for_selected_tank",
    "other_items_count",
    "other_items_json",
    "water_tank_size_liters",
    "water_tank_quantity",
    "pvc_pipes_quantity",
    "coupling_socket_specification",
    "coupling_socket_quantity",
    "elbow_90_degree_specification",
    "elbow_90_degree_quantity",
    "elbow_45_degree_specification",
    "elbow_45_degree_quantity",
    "equal_tee_plain_tee_specification",
    "equal_tee_plain_tee_quantity",
    "clean_out_plug_specification",
    "clean_out_plug_quantity",
    "end_cap_specification",
    "end_cap_quantity",
    "clamps_specification",
    "clamps_quantity",
    "ppr_plug_quantity",
    "thread_sealant_for_gi_pipes_and_fittings_quantity",
    "ash_clay_bricks_quantity",
    "pallets_specification",
    "pallets_quantity",
    "reducer_socket_centric_straight_plain_specification",
    "reducer_socket_centric_straight_plain_quantity",
    "reducer_socket_eccentric_specification",
    "reducer_socket_eccentric_quantity",
    "steel_nails_2_quantity",
    "steel_nails_3_quantity",
    "steel_nails_2_5_quantity",
    "screws_quantity",
    "plumbers_thread_quantity",
    "plumbers_tape_teflon_tape_quantity",
    "pump_nozel_quantity",
    "bib_cock_quantity",
    "rawal_plug_quantity",
    ...Array.from({ length: 10 }, (_, index) => `other_item_${index + 1}_name`),
    ...Array.from({ length: 10 }, (_, index) => `other_item_${index + 1}_quantity`),
  ],
};

const defaultSnapshot = {
  households: [],
  submittedForms: {},
  seafResponses: {},
  formSubmissions: {},
  generatedIds: [],
  updatedAt: null,
};

const parseJson = (value, fallback) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const stringifyJson = (value) => JSON.stringify(value ?? null);

const sanitizeSqlIdentifier = (value, fallback = "field") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 56);
  const safe = normalized || fallback;
  return /^[0-9]/.test(safe) ? `field_${safe}` : safe;
};

const normalizeCellValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value) || (value && typeof value === "object")) {
    return stringifyJson(value);
  }

  return String(value);
};

const extractTopLevelScalarFields = (value = {}) =>
  Object.fromEntries(
    Object.entries(value && typeof value === "object" ? value : {}).filter(([, nestedValue]) => {
      return (
        nestedValue === null ||
        nestedValue === undefined ||
        typeof nestedValue === "string" ||
        typeof nestedValue === "number" ||
        typeof nestedValue === "boolean"
      );
    })
  );

const toColumnMap = (rowData = {}) =>
  Object.fromEntries(
    Object.entries(rowData || {}).map(([key, value], index) => [
      sanitizeSqlIdentifier(key, `field_${index + 1}`),
      normalizeCellValue(value),
    ])
  );

const getTableName = (formKey) => tableNames[formKey] || null;

const ensurePool = () => {
  if (!pool) {
    pool = mysql.createPool({
      ...dbConfig,
      connectionLimit: dbConfig.connectionLimit || 10,
    });
  }

  return pool;
};

const withConnection = async (handler) => {
  const connection = await ensurePool().getConnection();

  try {
    return await handler(connection);
  } finally {
    connection.release();
  }
};

const createSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS household_info (
    household_id VARCHAR(64) NOT NULL PRIMARY KEY,
    payload_json JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS socio (
    household_id VARCHAR(64) NOT NULL PRIMARY KEY,
    payload_json JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS engineering (
    household_id VARCHAR(64) NOT NULL PRIMARY KEY,
    payload_json JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS inventory (
    household_id VARCHAR(64) NOT NULL PRIMARY KEY,
    payload_json JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS assessment_status (
    household_id VARCHAR(64) NOT NULL PRIMARY KEY,
    selected_household_name LONGTEXT NULL,
    cnic LONGTEXT NULL,
    household_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
    socio_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
    engineering_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
    inventory_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const ensureDatabase = async () => {
  const connection = await mysql.createConnection(bootstrapConfig);
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await connection.end();
  }
};

const ensureSchema = async () => {
  for (const statement of createSchemaStatements) {
    await ensurePool().query(statement);
  }

  await withConnection(async (connection) => {
    for (const [tableName, columns] of Object.entries(predefinedColumnsByTable)) {
      const rowShape = Object.fromEntries(columns.map((column, index) => [sanitizeSqlIdentifier(column, `field_${index + 1}`), ""]));
      await ensureDynamicColumns(connection, tableName, rowShape);
    }

    for (const tableName of [tableNames.household, tableNames.socio, tableNames.engineering, tableNames.inventory]) {
      await backfillPayloadJsonToColumns(connection, tableName);
    }
  });
};

const ensureDynamicColumns = async (connection, tableName, rowData = {}) => {
  const columnNames = Object.keys(rowData);
  if (columnNames.length === 0) {
    return;
  }

  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
  const existingColumns = new Set(rows.map((row) => row.Field));

  for (const columnName of columnNames) {
    if (existingColumns.has(columnName)) {
      continue;
    }

    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` LONGTEXT NULL`);
    existingColumns.add(columnName);
  }
};

const buildStoredRowData = (rowData = {}, payload = {}, extraData = {}) => {
  const payloadTableRow =
    payload && typeof payload.tableRow === "object" && payload.tableRow !== null
      ? payload.tableRow
      : {};

  return {
    ...extractTopLevelScalarFields(payload),
    ...extractTopLevelScalarFields(extraData),
    ...payloadTableRow,
    ...(rowData && typeof rowData === "object" ? rowData : {}),
  };
};

const upsertDynamicRow = async (connection, tableName, householdId, rowData = {}, payload = {}, extraData = {}) => {
  const normalizedRow = toColumnMap(buildStoredRowData(rowData, payload, extraData));
  delete normalizedRow.household_id;
  await ensureDynamicColumns(connection, tableName, normalizedRow);

  const data = {
    payload_json: stringifyJson(payload),
    ...normalizedRow,
  };

  const columns = ["household_id", ...Object.keys(data)];
  const values = [householdId, ...Object.values(data)];
  const placeholders = columns.map(() => "?").join(", ");
  const updates = Object.keys(data).map((column) => `\`${column}\` = VALUES(\`${column}\`)`);

  await connection.query(
    `INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(", ")})
     VALUES (${placeholders})
     ON DUPLICATE KEY UPDATE ${updates.join(", ")}`,
    values
  );
};

const backfillPayloadJsonToColumns = async (connection, tableName) => {
  const [rows] = await connection.query(
    `SELECT household_id, payload_json FROM \`${tableName}\` WHERE payload_json IS NOT NULL`
  );

  for (const row of rows) {
    const payload = parseJson(row.payload_json, null);
    if (!payload || typeof payload !== "object") {
      continue;
    }

    await upsertDynamicRow(connection, tableName, row.household_id, {}, payload);
  }
};

const upsertStatusRow = async (connection, householdId, patch = {}) => {
  const [rows] = await connection.query("SELECT * FROM assessment_status WHERE household_id = ?", [householdId]);
  const existing = rows[0] || {};

  const next = {
    selected_household_name: patch.selected_household_name || existing.selected_household_name || "",
    cnic: patch.cnic || existing.cnic || "",
    household_status: patch.household_status || existing.household_status || "Pending",
    socio_status: patch.socio_status || existing.socio_status || "Pending",
    engineering_status: patch.engineering_status || existing.engineering_status || "Pending",
    inventory_status: patch.inventory_status || existing.inventory_status || "Pending",
  };

  await connection.query(
    `INSERT INTO assessment_status (
      household_id, selected_household_name, cnic, household_status, socio_status, engineering_status, inventory_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      selected_household_name = VALUES(selected_household_name),
      cnic = VALUES(cnic),
      household_status = VALUES(household_status),
      socio_status = VALUES(socio_status),
      engineering_status = VALUES(engineering_status),
      inventory_status = VALUES(inventory_status)`,
    [
      householdId,
      next.selected_household_name,
      next.cnic,
      next.household_status,
      next.socio_status,
      next.engineering_status,
      next.inventory_status,
    ]
  );

  return next;
};

const getPayloadForForm = (formKey, payload = {}, householdPatch = {}) => {
  if (formKey === "household") {
    return {
      ...householdPatch,
      ...payload,
    };
  }

  return payload;
};

const getRowDataForForm = (formKey, payload = {}, householdPatch = {}) => {
  const normalizedPayload = payload && typeof payload === "object" ? payload : {};
  const normalizedPatch = householdPatch && typeof householdPatch === "object" ? householdPatch : {};

  if (formKey === "household") {
    return normalizedPayload.tableRow && typeof normalizedPayload.tableRow === "object"
      ? normalizedPayload.tableRow
      : normalizedPayload;
  }

  if (normalizedPayload.tableRow && typeof normalizedPayload.tableRow === "object") {
    return normalizedPayload.tableRow;
  }

  return normalizedPatch;
};

const getStatusPatchForForm = (formKey, status, payload = {}, householdPatch = {}, headName = "") => {
  const rowData = getRowDataForForm(formKey, payload, householdPatch);
  const selectedHouseholdName =
    rowData.selected_household_name ||
    rowData.household_head_name ||
    rowData.respondent_name ||
    householdPatch.headName ||
    headName ||
    "";
  const cnic = rowData.cnic || rowData.respondent_cnic || rowData.head_cnic || householdPatch.respondentCnic || householdPatch.headCnic || "";

  const patch = {
    selected_household_name: selectedHouseholdName,
    cnic,
  };

  if (formKey === "household") {
    patch.household_status = status;
  } else if (formKey === "seaf") {
    patch.socio_status = status;
  } else if (formKey === "engineering") {
    patch.engineering_status = status;
  } else if (formKey === "inventory") {
    patch.inventory_status = status;
  }

  return patch;
};

const normalizeRowForExport = (row = {}) =>
  Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => key !== "payload_json")
      .map(([key, value]) => [key, value === null || value === undefined ? "" : value])
  );

const buildHouseholdRecord = (householdRow = {}, statusRow = {}, engineeringRow = {}, inventoryRow = {}) => {
  const householdPayload = parseJson(householdRow.payload_json, {});

  return {
    ...householdPayload,
    householdId: householdRow.household_id,
    surveyDate: householdRow.survey_date || householdPayload.surveyDate || "",
    city: householdRow.city || householdPayload.city || "",
    ucnc: householdRow.ucnc || householdPayload.ucnc || "",
    address: householdRow.interview_address || householdPayload.address || "",
    catchmentArea: engineeringRow.total_catchment_area_sq_ft || householdRow.catchment_area || householdPayload.catchmentArea || "",
    tankSpace: engineeringRow.water_need_storage_liters || inventoryRow.selected_tank_size_liters || householdRow.tank_space || householdPayload.tankSpace || "",
    enumeratorName: householdRow.enumerator_name || householdPayload.enumeratorName || "",
    cmoName: householdRow.enumerator_name || householdPayload.cmoName || householdPayload.enumeratorName || "",
    headName:
      householdRow.household_head_name ||
      householdRow.respondent_name ||
      statusRow.selected_household_name ||
      householdPayload.headName ||
      "",
    respondentName: householdRow.respondent_name || householdPayload.respondentName || "",
    respondentCnic: householdRow.respondent_cnic || householdPayload.respondentCnic || "",
    headCnic: householdRow.head_cnic || householdPayload.headCnic || "",
    respondentGender: householdRow.respondent_gender || householdPayload.respondentGender || "",
    eligibilityStatus: householdRow.eligibility_status || householdPayload.eligibilityStatus || "",
    status: householdRow.eligibility_status || householdPayload.eligibilityStatus || "",
    engineerName: engineeringRow.engineer_name || "",
    stageStatus: {
      seaf: statusRow.socio_status === "Submitted",
      engineering: statusRow.engineering_status === "Submitted",
      inventory: statusRow.inventory_status === "Submitted",
    },
    updatedAt: householdRow.updated_at || statusRow.updated_at || null,
  };
};

const listDedicatedFormRows = async (formKey) => {
  const tableName = getTableName(formKey);
  if (!tableName) {
    return [];
  }

  const [rows] = await ensurePool().query(`SELECT * FROM \`${tableName}\` ORDER BY updated_at DESC, household_id DESC`);
  return rows.map(normalizeRowForExport);
};

const listHouseholds = async () => {
  const snapshot = await getSnapshot();
  return snapshot.households;
};

const getHouseholdById = async (householdId) => {
  const [householdRows, statusRows, engineeringRows, inventoryRows] = await Promise.all([
    ensurePool().query("SELECT * FROM household_info WHERE household_id = ?", [householdId]),
    ensurePool().query("SELECT * FROM assessment_status WHERE household_id = ?", [householdId]),
    ensurePool().query("SELECT * FROM engineering WHERE household_id = ?", [householdId]),
    ensurePool().query("SELECT * FROM inventory WHERE household_id = ?", [householdId]),
  ]);

  const householdRow = householdRows[0][0];
  if (!householdRow) {
    return null;
  }

  return buildHouseholdRecord(
    householdRow,
    statusRows[0][0] || {},
    engineeringRows[0][0] || {},
    inventoryRows[0][0] || {}
  );
};

const getFormSubmission = async (formKey, householdId) => {
  const tableName = getTableName(formKey);
  if (!tableName) {
    return null;
  }

  const [rows] = await ensurePool().query(
    `SELECT household_id, payload_json, updated_at FROM \`${tableName}\` WHERE household_id = ?`,
    [householdId]
  );

  if (!rows[0]) {
    return null;
  }

  return {
    payload: parseJson(rows[0].payload_json, {}),
    submittedAt: rows[0].updated_at || null,
  };
};

const getSnapshot = async () => {
  const [householdRows, statusRows, socioRows, engineeringRows, inventoryRows] = await Promise.all([
    ensurePool().query("SELECT * FROM household_info ORDER BY updated_at DESC, household_id DESC"),
    ensurePool().query("SELECT * FROM assessment_status ORDER BY updated_at DESC, household_id DESC"),
    ensurePool().query("SELECT * FROM socio ORDER BY updated_at DESC, household_id DESC"),
    ensurePool().query("SELECT * FROM engineering ORDER BY updated_at DESC, household_id DESC"),
    ensurePool().query("SELECT * FROM inventory ORDER BY updated_at DESC, household_id DESC"),
  ]);

  const statusMap = new Map(statusRows[0].map((row) => [row.household_id, row]));
  const socioMap = new Map(socioRows[0].map((row) => [row.household_id, row]));
  const engineeringMap = new Map(engineeringRows[0].map((row) => [row.household_id, row]));
  const inventoryMap = new Map(inventoryRows[0].map((row) => [row.household_id, row]));

  const households = householdRows[0].map((row) =>
    buildHouseholdRecord(
      row,
      statusMap.get(row.household_id) || {},
      engineeringMap.get(row.household_id) || {},
      inventoryMap.get(row.household_id) || {}
    )
  );

  const submittedForms = {};
  statusRows[0].forEach((row) => {
    submittedForms[row.household_id] = {
      headName: row.selected_household_name || "",
      household: row.household_status || "Pending",
      seaf: row.socio_status || "Pending",
      engineering: row.engineering_status || "Pending",
      inventory: row.inventory_status || "Pending",
      updatedAt: row.updated_at || null,
    };
  });

  const formSubmissions = {};
  const addSubmission = (rows, formKey) => {
    rows.forEach((row) => {
      if (!formSubmissions[row.household_id]) {
        formSubmissions[row.household_id] = {};
      }

      formSubmissions[row.household_id][formKey] = {
        payload: parseJson(row.payload_json, {}),
        submittedAt: row.updated_at || null,
      };
    });
  };

  addSubmission(householdRows[0], "household");
  addSubmission(socioRows[0], "seaf");
  addSubmission(engineeringRows[0], "engineering");
  addSubmission(inventoryRows[0], "inventory");

  const updatedAt = [householdRows[0], statusRows[0], socioRows[0], engineeringRows[0], inventoryRows[0]]
    .flat()
    .reduce((latest, row) => {
      const value = row.updated_at || row.created_at || null;
      if (!value) {
        return latest;
      }
      if (!latest) {
        return value;
      }
      return String(value) > String(latest) ? value : latest;
    }, null);

  return {
    ...defaultSnapshot,
    households,
    submittedForms,
    formSubmissions,
    generatedIds: householdRows[0].map((row) => row.household_id),
    updatedAt,
  };
};

const runTransaction = async (handler) =>
  withConnection(async (connection) => {
    await connection.beginTransaction();

    try {
      const result = await handler(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });

const upsertHousehold = async (householdId, payload = {}) =>
  runTransaction(async (connection) => {
    const mergedPayload = getPayloadForForm("household", payload, payload);
    const rowData = getRowDataForForm("household", mergedPayload, payload);
    await upsertDynamicRow(connection, tableNames.household, householdId, rowData, mergedPayload, payload);
    await upsertStatusRow(connection, householdId, getStatusPatchForForm("household", "Submitted", mergedPayload, payload, payload.headName || ""));
    return getHouseholdById(householdId);
  });

const submitForm = async ({ householdId, formKey, status = "Submitted", headName = "", payload = {}, householdPatch = {} }) =>
  runTransaction(async (connection) => {
    const tableName = getTableName(formKey);
    if (!tableName) {
      throw new Error("Unsupported form key.");
    }

    const mergedPayload = getPayloadForForm(formKey, payload, householdPatch);
    const rowData = getRowDataForForm(formKey, mergedPayload, householdPatch);

    await upsertDynamicRow(connection, tableName, householdId, rowData, mergedPayload, householdPatch);
    const nextStatus = await upsertStatusRow(
      connection,
      householdId,
      getStatusPatchForForm(formKey, status, mergedPayload, householdPatch, headName)
    );

    return {
      ok: true,
      householdId,
      formKey,
      status: {
        head_name: nextStatus.selected_household_name || "",
        household_status: nextStatus.household_status || "Pending",
        socio_status: nextStatus.socio_status || "Pending",
        engineering_status: nextStatus.engineering_status || "Pending",
        inventory_status: nextStatus.inventory_status || "Pending",
      },
    };
  });

const healthCheck = async () => {
  const [rows] = await ensurePool().query("SELECT 1 AS ok");
  return Boolean(rows[0]?.ok === 1);
};

const initializeDatabase = async () => {
  await ensureDatabase();
  await ensureSchema();
};

module.exports = {
  initializeDatabase,
  healthCheck,
  listHouseholds,
  listDedicatedFormRows,
  getHouseholdById,
  getFormSubmission,
  getSnapshot,
  upsertHousehold,
  submitForm,
};
