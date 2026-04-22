const fs = require("node:fs");
const mysql = require("mysql2/promise");
const { db: dbConfig, legacyDbFile } = require("./config");

const bootstrapConfig = {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
};

let pool;

const defaultSnapshot = {
  households: [],
  submittedForms: {},
  seafResponses: {},
  formSubmissions: {},
  generatedIds: [],
  updatedAt: null,
};

const asObject = (value, fallback = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  return value;
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

const toMySqlDatetime = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 23).replace("T", " ");
};

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
  `CREATE TABLE IF NOT EXISTS households (
    household_id VARCHAR(64) NOT NULL PRIMARY KEY,
    survey_date VARCHAR(32) NULL,
    city VARCHAR(120) NULL,
    ucnc VARCHAR(120) NULL,
    address TEXT NULL,
    catchment_area VARCHAR(60) NULL,
    tank_space VARCHAR(60) NULL,
    enumerator_name VARCHAR(160) NULL,
    head_name VARCHAR(160) NULL,
    respondent_name VARCHAR(160) NULL,
    respondent_cnic VARCHAR(40) NULL,
    head_cnic VARCHAR(40) NULL,
    respondent_gender VARCHAR(40) NULL,
    eligibility_status VARCHAR(40) NULL,
    status VARCHAR(40) NULL,
    cmo_name VARCHAR(160) NULL,
    engineer_name VARCHAR(160) NULL,
    engineer_employment_code VARCHAR(160) NULL,
    stage_status JSON NULL,
    raw_data JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS submitted_forms (
    household_id VARCHAR(64) NOT NULL PRIMARY KEY,
    head_name VARCHAR(160) NULL,
    household_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
    seaf_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
    engineering_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
    inventory_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT submitted_forms_household_fk FOREIGN KEY (household_id) REFERENCES households (household_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS form_submissions (
    household_id VARCHAR(64) NOT NULL,
    form_key VARCHAR(32) NOT NULL,
    payload JSON NULL,
    submitted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (household_id, form_key),
    CONSTRAINT form_submissions_household_fk FOREIGN KEY (household_id) REFERENCES households (household_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS generated_ids (
    household_id VARCHAR(64) NOT NULL PRIMARY KEY,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT generated_ids_household_fk FOREIGN KEY (household_id) REFERENCES households (household_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS seaf_responses (
    household_id VARCHAR(64) NOT NULL PRIMARY KEY,
    response JSON NULL,
    submitted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT seaf_responses_household_fk FOREIGN KEY (household_id) REFERENCES households (household_id) ON DELETE CASCADE
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
};

const toHouseholdColumns = (payload = {}) => ({
  survey_date: payload.surveyDate || null,
  city: payload.city || null,
  ucnc: payload.ucnc || null,
  address: payload.address || null,
  catchment_area: payload.catchmentArea || null,
  tank_space: payload.tankSpace || null,
  enumerator_name: payload.enumeratorName || null,
  head_name: payload.headName || null,
  respondent_name: payload.respondentName || null,
  respondent_cnic: payload.respondentCnic || null,
  head_cnic: payload.headCnic || null,
  respondent_gender: payload.respondentGender || null,
  eligibility_status: payload.eligibilityStatus || payload.status || null,
  status: payload.status || null,
  cmo_name: payload.cmoName || null,
  engineer_name: payload.engineerName || null,
  engineer_employment_code: payload.engineerEmploymentCode || null,
  stage_status: stringifyJson(asObject(payload.stageStatus, {})),
  raw_data: stringifyJson(payload),
});

const ensureHouseholdExists = async (connection, householdId, payload = {}) => {
  const columns = toHouseholdColumns(payload);
  const values = [
    householdId,
    columns.survey_date,
    columns.city,
    columns.ucnc,
    columns.address,
    columns.catchment_area,
    columns.tank_space,
    columns.enumerator_name,
    columns.head_name,
    columns.respondent_name,
    columns.respondent_cnic,
    columns.head_cnic,
    columns.respondent_gender,
    columns.eligibility_status,
    columns.status,
    columns.cmo_name,
    columns.engineer_name,
    columns.engineer_employment_code,
    columns.stage_status,
    columns.raw_data,
  ];

  await connection.query(
    `INSERT INTO households (
      household_id, survey_date, city, ucnc, address, catchment_area, tank_space, enumerator_name,
      head_name, respondent_name, respondent_cnic, head_cnic, respondent_gender, eligibility_status,
      status, cmo_name, engineer_name, engineer_employment_code, stage_status, raw_data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      survey_date = COALESCE(VALUES(survey_date), survey_date),
      city = COALESCE(VALUES(city), city),
      ucnc = COALESCE(VALUES(ucnc), ucnc),
      address = COALESCE(VALUES(address), address),
      catchment_area = COALESCE(VALUES(catchment_area), catchment_area),
      tank_space = COALESCE(VALUES(tank_space), tank_space),
      enumerator_name = COALESCE(VALUES(enumerator_name), enumerator_name),
      head_name = COALESCE(VALUES(head_name), head_name),
      respondent_name = COALESCE(VALUES(respondent_name), respondent_name),
      respondent_cnic = COALESCE(VALUES(respondent_cnic), respondent_cnic),
      head_cnic = COALESCE(VALUES(head_cnic), head_cnic),
      respondent_gender = COALESCE(VALUES(respondent_gender), respondent_gender),
      eligibility_status = COALESCE(VALUES(eligibility_status), eligibility_status),
      status = COALESCE(VALUES(status), status),
      cmo_name = COALESCE(VALUES(cmo_name), cmo_name),
      engineer_name = COALESCE(VALUES(engineer_name), engineer_name),
      engineer_employment_code = COALESCE(VALUES(engineer_employment_code), engineer_employment_code),
      stage_status = COALESCE(VALUES(stage_status), stage_status),
      raw_data = COALESCE(VALUES(raw_data), raw_data)`,
    values
  );

  await connection.query(
    `INSERT INTO generated_ids (household_id) VALUES (?) ON DUPLICATE KEY UPDATE household_id = VALUES(household_id)`,
    [householdId]
  );
};

const upsertSubmissionStatus = async (connection, householdId, formKey, status = "Submitted", extra = {}) => {
  const current = {
    head_name: extra.headName || "",
    household_status: "Pending",
    seaf_status: "Pending",
    engineering_status: "Pending",
    inventory_status: "Pending",
  };

  const [rows] = await connection.query("SELECT * FROM submitted_forms WHERE household_id = ?", [householdId]);
  const existing = rows[0] || current;

  const next = {
    head_name: extra.headName || existing.head_name || "",
    household_status: existing.household_status || "Pending",
    seaf_status: existing.seaf_status || "Pending",
    engineering_status: existing.engineering_status || "Pending",
    inventory_status: existing.inventory_status || "Pending",
  };

  const statusKeyMap = {
    household: "household_status",
    seaf: "seaf_status",
    engineering: "engineering_status",
    inventory: "inventory_status",
  };

  if (statusKeyMap[formKey]) {
    next[statusKeyMap[formKey]] = status;
  }

  await connection.query(
    `INSERT INTO submitted_forms (
      household_id, head_name, household_status, seaf_status, engineering_status, inventory_status
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      head_name = VALUES(head_name),
      household_status = VALUES(household_status),
      seaf_status = VALUES(seaf_status),
      engineering_status = VALUES(engineering_status),
      inventory_status = VALUES(inventory_status)`,
    [
      householdId,
      next.head_name,
      next.household_status,
      next.seaf_status,
      next.engineering_status,
      next.inventory_status,
    ]
  );

  return next;
};

const upsertFormSubmission = async (connection, householdId, formKey, payload) => {
  await connection.query(
    `INSERT INTO form_submissions (household_id, form_key, payload)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), submitted_at = CURRENT_TIMESTAMP(3)`,
    [householdId, formKey, stringifyJson(payload)]
  );
};

const upsertSeafResponse = async (connection, householdId, payload) => {
  await connection.query(
    `INSERT INTO seaf_responses (household_id, response)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE response = VALUES(response), submitted_at = CURRENT_TIMESTAMP(3)`,
    [householdId, stringifyJson(payload)]
  );
};

const getHouseholdByIdInConnection = async (connection, householdId) => {
  const [rows] = await connection.query("SELECT * FROM households WHERE household_id = ?", [householdId]);
  return rows[0] ? normalizeHouseholdRow(rows[0]) : null;
};

const normalizeHouseholdRow = (row) => {
  const rawData = parseJson(row.raw_data, {});
  const stageStatus = parseJson(row.stage_status, {});

  return {
    ...rawData,
    householdId: row.household_id,
    surveyDate: row.survey_date || rawData.surveyDate || "",
    city: row.city || rawData.city || "",
    ucnc: row.ucnc || rawData.ucnc || "",
    address: row.address || rawData.address || "",
    catchmentArea: row.catchment_area || rawData.catchmentArea || "",
    tankSpace: row.tank_space || rawData.tankSpace || "",
    enumeratorName: row.enumerator_name || rawData.enumeratorName || "",
    headName: row.head_name || rawData.headName || "",
    respondentName: row.respondent_name || rawData.respondentName || "",
    respondentCnic: row.respondent_cnic || rawData.respondentCnic || "",
    headCnic: row.head_cnic || rawData.headCnic || "",
    respondentGender: row.respondent_gender || rawData.respondentGender || "",
    eligibilityStatus: row.eligibility_status || rawData.eligibilityStatus || row.status || rawData.status || "",
    status: row.status || rawData.status || "",
    cmoName: row.cmo_name || rawData.cmoName || "",
    engineerName: row.engineer_name || rawData.engineerName || "",
    engineerEmploymentCode: row.engineer_employment_code || rawData.engineerEmploymentCode || "",
    stageStatus: asObject(stageStatus, {}),
    updatedAt: row.updated_at || rawData.updatedAt || null,
  };
};

const listHouseholds = async () => {
  const [rows] = await ensurePool().query(
    "SELECT * FROM households ORDER BY updated_at DESC, household_id DESC"
  );
  return rows.map(normalizeHouseholdRow);
};

const getHouseholdById = async (householdId) => {
  const [rows] = await ensurePool().query("SELECT * FROM households WHERE household_id = ?", [householdId]);
  return rows[0] ? normalizeHouseholdRow(rows[0]) : null;
};

const getFormSubmission = async (formKey, householdId) => {
  const [rows] = await ensurePool().query(
    "SELECT household_id, form_key, payload, submitted_at FROM form_submissions WHERE household_id = ? AND form_key = ?",
    [householdId, formKey]
  );

  if (!rows[0]) {
    return null;
  }

  return {
    payload: parseJson(rows[0].payload, {}),
    submittedAt: rows[0].submitted_at || null,
  };
};

const getSnapshot = async () => {
  const [householdRows, submittedRows, formRows, generatedRows, seafRows] = await Promise.all([
    ensurePool().query("SELECT * FROM households ORDER BY updated_at DESC, household_id DESC"),
    ensurePool().query("SELECT * FROM submitted_forms ORDER BY updated_at DESC, household_id DESC"),
    ensurePool().query("SELECT * FROM form_submissions ORDER BY submitted_at DESC, household_id DESC, form_key DESC"),
    ensurePool().query("SELECT household_id FROM generated_ids ORDER BY created_at DESC, household_id DESC"),
    ensurePool().query("SELECT * FROM seaf_responses ORDER BY submitted_at DESC, household_id DESC"),
  ]);

  const submittedForms = {};
  submittedRows[0].forEach((row) => {
    submittedForms[row.household_id] = {
      headName: row.head_name || "",
      household: row.household_status || "Pending",
      seaf: row.seaf_status || "Pending",
      engineering: row.engineering_status || "Pending",
      inventory: row.inventory_status || "Pending",
      updatedAt: row.updated_at || null,
    };
  });

  const formSubmissions = {};
  formRows[0].forEach((row) => {
    if (!formSubmissions[row.household_id]) {
      formSubmissions[row.household_id] = {};
    }

    formSubmissions[row.household_id][row.form_key] = {
      payload: parseJson(row.payload, {}),
      submittedAt: row.submitted_at || null,
    };
  });

  const seafResponses = {};
  seafRows[0].forEach((row) => {
    seafResponses[row.household_id] = {
      payload: parseJson(row.response, {}),
      submittedAt: row.submitted_at || null,
    };
  });

  const households = householdRows[0].map(normalizeHouseholdRow);
  const generatedIds = generatedRows[0].map((row) => row.household_id);
  const updatedAt = [householdRows[0], submittedRows[0], formRows[0], generatedRows[0], seafRows[0]]
    .flat()
    .reduce((latest, row) => {
      const value = row.updated_at || row.submitted_at || row.created_at || null;
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
    seafResponses,
    formSubmissions,
    generatedIds,
    updatedAt,
  };
};

const runTransaction = async (handler) => {
  return withConnection(async (connection) => {
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
};

const upsertHousehold = async (householdId, payload = {}) =>
  runTransaction(async (connection) => {
    await ensureHouseholdExists(connection, householdId, payload);
    return getHouseholdByIdInConnection(connection, householdId);
  });

const submitForm = async ({ householdId, formKey, status = "Submitted", headName = "", payload = {}, householdPatch = {} }) =>
  runTransaction(async (connection) => {
    await ensureHouseholdExists(connection, householdId, householdPatch);
    const nextStatus = await upsertSubmissionStatus(connection, householdId, formKey, status, { headName });
    await upsertFormSubmission(connection, householdId, formKey, payload);

    if (formKey === "seaf") {
      await upsertSeafResponse(connection, householdId, payload);
    }

    if (Object.keys(householdPatch || {}).length > 0) {
      await ensureHouseholdExists(connection, householdId, {
        ...householdPatch,
        householdId,
      });
    }

    return {
      ok: true,
      householdId,
      formKey,
      status: nextStatus,
    };
  });

const seedLegacyData = async () => {
  if (!fs.existsSync(legacyDbFile)) {
    return false;
  }

  const snapshot = parseJson(fs.readFileSync(legacyDbFile, "utf8"), null);
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }

  const [countRows] = await ensurePool().query("SELECT COUNT(*) AS count FROM households");
  const hasHouseholds = Number(countRows[0]?.count || 0) > 0;

  const legacyHouseholds = Array.isArray(snapshot.households) ? snapshot.households : [];
  const legacySubmittedForms = asObject(snapshot.submittedForms, {});
  const legacyFormSubmissions = asObject(snapshot.formSubmissions, {});
  const legacySeafResponses = asObject(snapshot.seafResponses, {});
  const legacyGeneratedIds = Array.isArray(snapshot.generatedIds) ? snapshot.generatedIds : [];

  await runTransaction(async (connection) => {
    for (const household of legacyHouseholds) {
      if (!household?.householdId) {
        continue;
      }

      const [existingRows] = await connection.query(
        "SELECT survey_date, raw_data FROM households WHERE household_id = ?",
        [household.householdId]
      );
      const existingRow = existingRows[0] || null;
      const existingRaw = parseJson(existingRow?.raw_data, {});
      const shouldRepair =
        !existingRow ||
        !existingRow.survey_date ||
        !existingRaw.surveyDate ||
        !existingRaw.headName;

      if (shouldRepair) {
        await ensureHouseholdExists(connection, household.householdId, household);
      }
    }

    if (!hasHouseholds) {
      for (const [householdId, record] of Object.entries(legacySubmittedForms)) {
        if (!householdId) {
          continue;
        }

        await ensureHouseholdExists(connection, householdId, { householdId });
        await connection.query(
          `INSERT INTO submitted_forms (
            household_id, head_name, household_status, seaf_status, engineering_status, inventory_status
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            head_name = VALUES(head_name),
            household_status = VALUES(household_status),
            seaf_status = VALUES(seaf_status),
            engineering_status = VALUES(engineering_status),
            inventory_status = VALUES(inventory_status)`,
          [
            householdId,
            record.headName || "",
            record.household || "Pending",
            record.seaf || "Pending",
            record.engineering || "Pending",
            record.inventory || "Pending",
          ]
        );
      }

      for (const [householdId, forms] of Object.entries(legacyFormSubmissions)) {
        if (!householdId || !forms || typeof forms !== "object") {
          continue;
        }

        for (const [formKey, entry] of Object.entries(forms)) {
          await ensureHouseholdExists(connection, householdId, { householdId });
          await connection.query(
            `INSERT INTO form_submissions (household_id, form_key, payload, submitted_at)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE payload = VALUES(payload), submitted_at = VALUES(submitted_at)`,
            [householdId, formKey, stringifyJson(entry?.payload || {}), toMySqlDatetime(entry?.submittedAt)]
          );
        }
      }

      for (const [householdId, entry] of Object.entries(legacySeafResponses)) {
        if (!householdId) {
          continue;
        }

        await ensureHouseholdExists(connection, householdId, { householdId });
        await connection.query(
          `INSERT INTO seaf_responses (household_id, response, submitted_at)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE response = VALUES(response), submitted_at = VALUES(submitted_at)`,
          [householdId, stringifyJson(entry?.payload || {}), toMySqlDatetime(entry?.submittedAt)]
        );
      }

      for (const householdId of legacyGeneratedIds) {
        if (!householdId) {
          continue;
        }

        await ensureHouseholdExists(connection, householdId, { householdId });
      }
    }
  });

  return true;
};

const healthCheck = async () => {
  const [rows] = await ensurePool().query("SELECT 1 AS ok");
  return Boolean(rows[0]?.ok === 1);
};

const initializeDatabase = async () => {
  await ensureDatabase();
  await ensureSchema();
  await seedLegacyData();
};

module.exports = {
  initializeDatabase,
  healthCheck,
  listHouseholds,
  getHouseholdById,
  getFormSubmission,
  getSnapshot,
  upsertHousehold,
  submitForm,
};
