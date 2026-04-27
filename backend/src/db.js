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

const tablesWithRawPayload = new Set();

const simpleViewNamesByTable = {
  household_info: "household_info_simple",
  socio: "socio_simple",
  engineering: "engineering_simple",
  inventory: "inventory_simple",
};

const engineeringCatchmentPrefixes = [
  "mumty_s_rooftop",
  "rooftop_1",
  "rooftop_2",
  "balcony_1",
  "balcony_2",
  "balcony_3",
  "terrace_1",
  "terrace_2",
  "terrace_3",
  "shade_1",
  "shade_2",
  "shade_3",
];

let pool;

const sharedIdentityColumns = [
  "household_id",
  "selected_household_name",
  "respondent_cnic",
  "head_cnic",
];

const predefinedColumnsByTable = {
  household_info: [
    "household_id",
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
    "underground_tank_count",
    "underground_tank_material",
    "underground_tank_total_capacity",
    "overhead_tank_count",
    "overhead_tank_material",
    "overhead_tank_total_capacity",
  ],
  inventory: [
    ...sharedIdentityColumns,
    "catchment_area_from_engineering",
    "recommended_tank",
    "selected_tank_size_liters",
    "pallet_spec_for_selected_tank",
    "other_items_count",
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

const escapeSqlIdentifier = (value) => `\`${String(value).replace(/`/g, "``")}\``;

const tableStoresRawPayload = (tableName) => tablesWithRawPayload.has(tableName);

const parseJsonArray = (value) => {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
};

const isRawJsonExportColumn = (columnName) => columnName === "payload_json" || String(columnName || "").endsWith("_json");

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

const isNestedDynamicExportColumn = (columnName) =>
  /_drainage_point_\d+_diameter$/.test(columnName) ||
  /_tank_\d+_(depth|width|length|capacity)$/.test(columnName) ||
  /_(width_ft|length_ft|area_sq_ft)$/.test(columnName);

const getPredefinedExportColumnSet = (tableName) =>
  new Set([
    "created_at",
    "updated_at",
    ...(predefinedColumnsByTable[tableName] || []).map((columnName, index) => sanitizeSqlIdentifier(columnName, `field_${index + 1}`)),
  ]);

const isSimpleExportColumn = (tableName, columnName) => {
  if (isRawJsonExportColumn(columnName)) {
    return false;
  }

  if (!tableName) {
    return true;
  }

  return getPredefinedExportColumnSet(tableName).has(columnName) || isNestedDynamicExportColumn(columnName);
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

const normalizeNullableForeignKeyCells = (rowData = {}) => {
  for (const columnName of ["respondent_cnic", "head_cnic"]) {
    if (Object.prototype.hasOwnProperty.call(rowData, columnName) && String(rowData[columnName] ?? "").trim() === "") {
      rowData[columnName] = null;
    }
  }

  return rowData;
};

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
  `CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'manager', 'viewer') NOT NULL DEFAULT 'admin',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS household_info (
    household_id VARCHAR(64) NOT NULL PRIMARY KEY,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS socio (
    household_id VARCHAR(64) NOT NULL PRIMARY KEY,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS engineering (
    household_id VARCHAR(64) NOT NULL PRIMARY KEY,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS inventory (
    household_id VARCHAR(64) NOT NULL PRIMARY KEY,
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

const obsoleteColumnsByTable = {
  household_info: [
    "cnic",
    "householdid",
    "surveydate",
    "householdlocation",
    "address",
    "catchmentarea",
    "tankspace",
    "enumeratorname",
    "respondentishouseholdhead",
    "relationshiptohead",
    "headname",
    "respondentname",
    "respondentcnic",
    "headcnic",
    "respondentgender",
    "respondentphonenumber",
    "respondentage",
    "eligibilitystatus",
    "status",
    "cmoname",
    "engineername",
    "updatedat",
  ],
  socio: [
    "cnic",
    "household_members_json",
    "selected_facilities_json",
    "selected_utilities_json",
    "street_greening_on",
    "house_greening_on",
  ],
  engineering: [
    "cnic",
    "catchment_rows_json",
    "underground_tanks_json",
    "overhead_tanks_json",
  ],
  inventory: [
    "cnic",
    "other_items_json",
  ],
};

const childFormTablesWithHouseholdCnicFks = [
  tableNames.socio,
  tableNames.engineering,
  tableNames.inventory,
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

    await dropObsoleteColumns(connection);
    await ensureHouseholdCnicForeignKeys(connection);
  });
};

const getExistingColumnNames = async (connection, tableName) => {
  const [rows] = await connection.query(`SHOW COLUMNS FROM ${escapeSqlIdentifier(tableName)}`);
  return new Set(rows.map((row) => row.Field));
};

const dropObsoleteColumns = async (connection) => {
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const [tableName, columnNames] of Object.entries(obsoleteColumnsByTable)) {
      const existingColumns = await getExistingColumnNames(connection, tableName);
      for (const columnName of columnNames) {
        if (!existingColumns.has(columnName)) {
          continue;
        }

        await connection.query(
          `ALTER TABLE ${escapeSqlIdentifier(tableName)} DROP COLUMN ${escapeSqlIdentifier(columnName)}`
        );
      }
    }
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }
};

const ensureColumnType = async (connection, tableName, columnName, columnDefinition) => {
  const existingColumns = await getExistingColumnNames(connection, tableName);
  if (!existingColumns.has(columnName)) {
    return;
  }

  await connection.query(
    `ALTER TABLE ${escapeSqlIdentifier(tableName)} MODIFY ${escapeSqlIdentifier(columnName)} ${columnDefinition}`
  );
};

const ensureIndex = async (connection, tableName, indexName, columnName) => {
  const [rows] = await connection.query(
    `SHOW INDEX FROM ${escapeSqlIdentifier(tableName)} WHERE Key_name = ?`,
    [indexName]
  );
  if (rows.length > 0) {
    return;
  }

  await connection.query(
    `CREATE INDEX ${escapeSqlIdentifier(indexName)} ON ${escapeSqlIdentifier(tableName)} (${escapeSqlIdentifier(columnName)})`
  );
};

const ensureForeignKey = async (connection, tableName, constraintName, columnName, referencedColumnName) => {
  const [rows] = await connection.query(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [dbConfig.database, tableName, constraintName]
  );
  if (rows.length > 0) {
    return;
  }

  await connection.query(
    `ALTER TABLE ${escapeSqlIdentifier(tableName)}
     ADD CONSTRAINT ${escapeSqlIdentifier(constraintName)}
     FOREIGN KEY (${escapeSqlIdentifier(columnName)})
     REFERENCES ${escapeSqlIdentifier(tableNames.household)} (${escapeSqlIdentifier(referencedColumnName)})
     ON UPDATE CASCADE
     ON DELETE SET NULL`
  );
};

const normalizeCnicReferences = async (connection) => {
  for (const tableName of [tableNames.household, ...childFormTablesWithHouseholdCnicFks]) {
    for (const columnName of ["respondent_cnic", "head_cnic"]) {
      await connection.query(
        `UPDATE ${escapeSqlIdentifier(tableName)}
         SET ${escapeSqlIdentifier(columnName)} = NULL
         WHERE TRIM(COALESCE(${escapeSqlIdentifier(columnName)}, "")) = ""`
      );
    }
  }

  for (const tableName of childFormTablesWithHouseholdCnicFks) {
    for (const columnName of ["respondent_cnic", "head_cnic"]) {
      await connection.query(
        `UPDATE ${escapeSqlIdentifier(tableName)} child
         LEFT JOIN ${escapeSqlIdentifier(tableNames.household)} parent
           ON child.${escapeSqlIdentifier(columnName)} = parent.${escapeSqlIdentifier(columnName)}
         SET child.${escapeSqlIdentifier(columnName)} = NULL
         WHERE child.${escapeSqlIdentifier(columnName)} IS NOT NULL
           AND parent.household_id IS NULL`
      );
    }
  }
};

const ensureHouseholdCnicForeignKeys = async (connection) => {
  for (const tableName of [tableNames.household, ...childFormTablesWithHouseholdCnicFks]) {
    await ensureColumnType(connection, tableName, "respondent_cnic", "VARCHAR(32) NULL");
    await ensureColumnType(connection, tableName, "head_cnic", "VARCHAR(32) NULL");
  }

  await normalizeCnicReferences(connection);

  await ensureIndex(connection, tableNames.household, "idx_household_info_respondent_cnic", "respondent_cnic");
  await ensureIndex(connection, tableNames.household, "idx_household_info_head_cnic", "head_cnic");

  for (const tableName of childFormTablesWithHouseholdCnicFks) {
    await ensureIndex(connection, tableName, `idx_${tableName}_respondent_cnic`, "respondent_cnic");
    await ensureIndex(connection, tableName, `idx_${tableName}_head_cnic`, "head_cnic");
    await ensureForeignKey(connection, tableName, `fk_${tableName}_respondent_cnic`, "respondent_cnic", "respondent_cnic");
    await ensureForeignKey(connection, tableName, `fk_${tableName}_head_cnic`, "head_cnic", "head_cnic");
  }
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

  const mergedRow = {
    ...extractTopLevelScalarFields(payload),
    ...extractTopLevelScalarFields(extraData),
    ...payloadTableRow,
    ...(rowData && typeof rowData === "object" ? rowData : {}),
  };

  return {
    ...mergedRow,
    ...expandNestedTableData(mergedRow),
  };
};

const getPayloadTableRow = (payload = {}) => {
  const normalizedPayload = payload && typeof payload === "object" ? payload : {};
  const tableRow = normalizedPayload.tableRow && typeof normalizedPayload.tableRow === "object" && !Array.isArray(normalizedPayload.tableRow)
    ? normalizedPayload.tableRow
    : extractTopLevelScalarFields(normalizedPayload);

  return {
    ...tableRow,
    ...expandNestedTableData(tableRow),
  };
};

const expandCatchmentRows = (value) => {
  const columns = {};
  const rows = parseJsonArray(value);

  rows.forEach((catchmentRow, index) => {
    if (!catchmentRow || typeof catchmentRow !== "object") {
      return;
    }

    const prefix = sanitizeSqlIdentifier(catchmentRow.areaName || catchmentRow.name || `catchment_${index + 1}`, `catchment_${index + 1}`);
    columns[`${prefix}_width_ft`] = normalizeCellValue(catchmentRow.widthFt ?? catchmentRow.width ?? "");
    columns[`${prefix}_length_ft`] = normalizeCellValue(catchmentRow.lengthFt ?? catchmentRow.length ?? "");
    columns[`${prefix}_area_sq_ft`] = normalizeCellValue(catchmentRow.areaSqFt ?? catchmentRow.area ?? "");

    parseJsonArray(catchmentRow.drainagePoints).forEach((point, pointIndex) => {
      const pointNumber = point && typeof point === "object" && point.point ? point.point : pointIndex + 1;
      const diameter = point && typeof point === "object" ? point.diameter : point;
      columns[`${prefix}_drainage_point_${pointNumber}_diameter`] = normalizeCellValue(diameter ?? "");
    });
  });

  return columns;
};

const expandTankRows = (value, tankType) => {
  const columns = {};
  const rows = parseJsonArray(value);

  rows.forEach((tankRow, index) => {
    if (!tankRow || typeof tankRow !== "object") {
      return;
    }

    const prefix = `${sanitizeSqlIdentifier(tankType, "tank")}_tank_${index + 1}`;
    columns[`${prefix}_depth`] = normalizeCellValue(tankRow.depth ?? "");
    columns[`${prefix}_width`] = normalizeCellValue(tankRow.width ?? "");
    columns[`${prefix}_length`] = normalizeCellValue(tankRow.length ?? "");
    columns[`${prefix}_capacity`] = normalizeCellValue(tankRow.capacity ?? "");
  });

  return columns;
};

const expandNestedTableData = (rowData = {}) => ({
  ...expandCatchmentRows(rowData.catchment_rows_json),
  ...expandTankRows(rowData.underground_tanks_json, "underground"),
  ...expandTankRows(rowData.overhead_tanks_json, "overhead"),
});

const upsertDynamicRow = async (connection, tableName, householdId, rowData = {}, payload = {}, extraData = {}) => {
  const normalizedRow = toColumnMap(buildStoredRowData(rowData, payload, extraData));
  normalizeNullableForeignKeyCells(normalizedRow);
  delete normalizedRow.household_id;

  if (!tableStoresRawPayload(tableName)) {
    Object.keys(normalizedRow).forEach((columnName) => {
      if (isRawJsonExportColumn(columnName) || !isSimpleExportColumn(tableName, columnName)) {
        delete normalizedRow[columnName];
      }
    });
  }

  await ensureDynamicColumns(connection, tableName, normalizedRow);

  const data = {
    ...(tableStoresRawPayload(tableName) ? { payload_json: stringifyJson(payload) } : {}),
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
  if (!tableStoresRawPayload(tableName)) {
    return;
  }

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

const ensureSimpleExportView = async (connection, tableName) => {
  const viewName = simpleViewNamesByTable[tableName];
  if (!viewName) {
    return;
  }

  const [rows] = await connection.query(`SHOW COLUMNS FROM ${escapeSqlIdentifier(tableName)}`);
  const columns = rows.map((row) => row.Field).filter((columnName) => isSimpleExportColumn(tableName, columnName));

  if (columns.length === 0) {
    return;
  }

  await connection.query(
    `CREATE OR REPLACE VIEW ${escapeSqlIdentifier(viewName)} AS
     SELECT ${columns.map(escapeSqlIdentifier).join(", ")}
     FROM ${escapeSqlIdentifier(tableName)}`
  );
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
  } else if (formKey === "seaf" || formKey === "socio") {
    patch.socio_status = status;
  } else if (formKey === "engineering") {
    patch.engineering_status = status;
  } else if (formKey === "inventory") {
    patch.inventory_status = status;
  }

  return patch;
};

const normalizeRowForExport = (row = {}, tableName = "") => {
  const payload = parseJson(row.payload_json, {});
  const payloadColumns = toColumnMap(getPayloadTableRow(payload));
  const systemColumns = {};
  const exported = {};

  if (Object.prototype.hasOwnProperty.call(row, "household_id")) {
    exported.household_id = row.household_id ?? "";
  }

  Object.entries(payloadColumns).forEach(([key, value]) => {
    if (isSimpleExportColumn(tableName, key) && key !== "household_id") {
      exported[key] = value ?? "";
    }
  });

  Object.entries(row).forEach(([key, value]) => {
    if (!isSimpleExportColumn(tableName, key) || key === "household_id") {
      return;
    }

    if (key === "created_at" || key === "updated_at") {
      systemColumns[key] = value === null || value === undefined ? "" : value;
      return;
    }

    const normalizedValue = value === null || value === undefined ? "" : value;
    if (!Object.prototype.hasOwnProperty.call(exported, key) || exported[key] === "") {
      exported[key] = normalizedValue;
    }
  });

  return {
    ...exported,
    ...systemColumns,
  };
};

const buildEngineeringCatchmentRowsFromFlatRow = (row = {}) =>
  engineeringCatchmentPrefixes.map((prefix) => ({
    width: row[`${prefix}_width_ft`] || "",
    length: row[`${prefix}_length_ft`] || "",
    area: row[`${prefix}_area_sq_ft`] || "",
  }));

const buildInventoryItemsFromFlatRow = (row = {}) =>
  Array.from({ length: 10 }, (_, index) => {
    const itemNumber = index + 1;
    const name = row[`other_item_${itemNumber}_name`] || "";
    const quantity = row[`other_item_${itemNumber}_quantity`] || "";
    return name || quantity
      ? {
          name,
          quantity,
          specification: "",
          isCustom: true,
        }
      : null;
  }).filter(Boolean);

const buildFlatFormPayload = (formKey, row = {}) => {
  const tableName = getTableName(formKey);
  const tableRow = normalizeRowForExport(row, tableName);

  if (formKey === "household") {
    return {
      householdId: row.household_id || "",
      surveyDate: row.survey_date || "",
      householdLocation: row.household_location || "",
      city: row.city || "",
      ucnc: row.ucnc || "",
      address: row.interview_address || "",
      catchmentArea: row.catchment_area || "",
      tankSpace: row.tank_space || "",
      enumeratorName: row.enumerator_name || "",
      respondentIsHouseholdHead: row.respondent_is_household_head || "",
      relationshipToHead: row.relationship_to_head || "",
      headName: row.household_head_name || row.respondent_name || "",
      respondentName: row.respondent_name || "",
      respondentCnic: row.respondent_cnic || "",
      headCnic: row.head_cnic || "",
      respondentGender: row.respondent_gender || "",
      respondentPhoneNumber: row.respondent_phone_number || "",
      respondentAge: row.respondent_age || "",
      eligibilityStatus: row.eligibility_status || "",
      tableRow,
    };
  }

  if (formKey === "seaf" || formKey === "socio") {
    return {
      facilities: [],
      utilities: [],
      formState: {
        version: 1,
        meta: {
          personCount: row.household_members_count || "1",
        },
        controls: [],
      },
      tableRow,
    };
  }

  if (formKey === "inventory") {
    const items = buildInventoryItemsFromFlatRow(row);

    return {
      catchmentArea: row.catchment_area_from_engineering || "",
      recommendedTank: row.recommended_tank || "",
      selectedTankSize: row.selected_tank_size_liters || "",
      palletSpec: row.pallet_spec_for_selected_tank || "",
      otherItems: items.map(({ name, quantity }) => ({ name, quantity })),
      items,
      formState: {
        version: 1,
        meta: {
          otherItemsCount: row.other_items_count || String(items.length),
        },
        controls: [],
      },
      tableRow,
    };
  }

  if (formKey === "engineering") {
    return {
      engineerName: row.engineer_name || "",
      housingWidth: row.housing_width_ft || "",
      housingDepth: row.housing_depth_ft || "",
      housingArea: row.housing_area_sq_ft || "",
      catchmentRows: buildEngineeringCatchmentRowsFromFlatRow(row),
      catchmentTotalArea: row.total_catchment_area_sq_ft || "",
      engineeringCatchmentArea: row.total_catchment_area_sq_ft || "",
      engineeringCatchmentTotalArea: row.total_catchment_area_sq_ft || "",
      waterNeedArea: row.water_need_area_a_sq_ft || "",
      waterNeedSpace: row.water_need_space_s_cubic_ft || "",
      waterNeedQuantity: row.water_need_quantity_q_liters || "",
      waterNeedHouseholdSize: row.water_need_household_size || "",
      waterNeedDaily: row.water_need_daily_liters || "",
      engineeringTankSpace: row.water_need_storage_liters || "",
      proposedStorageCapacity: row.proposed_storage_capacity || "",
      formState: {
        version: 1,
        meta: {
          tankCounts: {
            underground: row.underground_tank_count || "0",
            overhead: row.overhead_tank_count || "0",
          },
        },
        controls: [],
      },
      tableRow,
    };
  }

  return { tableRow };
};

const buildFormPayloadFromRow = (formKey, row = {}) => {
  const rawPayload = tableStoresRawPayload(getTableName(formKey)) ? parseJson(row.payload_json, null) : null;
  return rawPayload && typeof rawPayload === "object" ? rawPayload : buildFlatFormPayload(formKey, row);
};

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
  return rows.map((row) => normalizeRowForExport(row, tableName));
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

  const [rows] = await ensurePool().query(`SELECT * FROM \`${tableName}\` WHERE household_id = ?`, [householdId]);

  if (!rows[0]) {
    return null;
  }

  return {
    payload: buildFormPayloadFromRow(formKey, rows[0]),
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
        payload: buildFormPayloadFromRow(formKey, row),
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

const countAdminUsers = async () => {
  const [rows] = await ensurePool().query("SELECT COUNT(*) AS total FROM admin_users");
  return Number(rows[0]?.total || 0);
};

const findAdminUserByEmail = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const [rows] = await ensurePool().query(
    `SELECT id, name, email, password_hash, role, is_active, created_at, updated_at
     FROM admin_users
     WHERE email = ?
     LIMIT 1`,
    [normalizedEmail]
  );

  return rows[0] || null;
};

const createAdminUser = async ({ name, email, passwordHash, role = "admin", isActive = 1 }) => {
  const normalizedName = String(name || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPasswordHash = String(passwordHash || "").trim();
  const normalizedRole = ["admin", "manager", "viewer"].includes(role) ? role : "admin";
  const activeFlag = isActive ? 1 : 0;

  if (!normalizedName || !normalizedEmail || !normalizedPasswordHash) {
    throw new Error("Name, email, and password hash are required.");
  }

  await ensurePool().query(
    `INSERT INTO admin_users (name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [normalizedName, normalizedEmail, normalizedPasswordHash, normalizedRole, activeFlag]
  );

  return findAdminUserByEmail(normalizedEmail);
};

const upsertAdminUser = async ({ name, email, passwordHash, role = "admin", isActive = 1 }) => {
  const normalizedName = String(name || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPasswordHash = String(passwordHash || "").trim();
  const normalizedRole = ["admin", "manager", "viewer"].includes(role) ? role : "admin";
  const activeFlag = isActive ? 1 : 0;

  if (!normalizedName || !normalizedEmail || !normalizedPasswordHash) {
    throw new Error("Name, email, and password hash are required.");
  }

  await ensurePool().query(
    `INSERT INTO admin_users (name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       password_hash = VALUES(password_hash),
       role = VALUES(role),
       is_active = VALUES(is_active)`,
    [normalizedName, normalizedEmail, normalizedPasswordHash, normalizedRole, activeFlag]
  );

  return findAdminUserByEmail(normalizedEmail);
};

const initializeDatabase = async () => {
  await ensureDatabase();
  await ensureSchema();
};

module.exports = {
  initializeDatabase,
  healthCheck,
  countAdminUsers,
  findAdminUserByEmail,
  createAdminUser,
  upsertAdminUser,
  listHouseholds,
  listDedicatedFormRows,
  getHouseholdById,
  getFormSubmission,
  getSnapshot,
  upsertHousehold,
  submitForm,
};
