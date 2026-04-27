const http = require("node:http");
const { URL } = require("node:url");
const bcrypt = require("bcryptjs");
const { frontendDir, host, port, management } = require("./config");
const {
  healthCheck,
  initializeDatabase,
  countAdminUsers,
  findAdminUserByEmail,
  listHouseholds,
  listDedicatedFormRows,
  getHouseholdById,
  getFormSubmission,
  getSnapshot,
  upsertHousehold,
  submitForm,
} = require("./db");
const { sendJson, sendText, sendDownload, readRequestBody, serveStatic } = require("./http");

const allowedForms = new Set(["household", "seaf", "socio", "engineering", "inventory"]);
const exportableDatasets = new Set([
  "households",
  "household-info",
  "submitted-forms",
  "status",
  "form-submissions",
  "socio",
  "seaf",
  "engineering",
  "inventory",
  "snapshot",
]);

const escapeCsvValue = (value) => {
  const normalized = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${normalized.replace(/"/g, "\"\"")}"`;
};

const toCsv = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "";
  }

  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );

  const header = columns.map(escapeCsvValue).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCsvValue(row?.[column])).join(",")).join("\n");
  return `${header}\n${body}`;
};

const toSubmittedFormsRows = (submittedForms = {}) =>
  Object.entries(submittedForms).map(([householdId, record]) => ({
    householdId,
    headName: record?.headName || "",
    householdStatus: record?.household || "Pending",
    seafStatus: record?.seaf || "Pending",
    engineeringStatus: record?.engineering || "Pending",
    inventoryStatus: record?.inventory || "Pending",
    updatedAt: record?.updatedAt || "",
  }));

const toFormSubmissionRows = (formSubmissions = {}) => {
  const rows = [];

  Object.entries(formSubmissions).forEach(([householdId, forms]) => {
    Object.entries(forms || {}).forEach(([formKey, entry]) => {
      rows.push({
        householdId,
        formKey,
        submittedAt: entry?.submittedAt || "",
        payload: entry?.payload || {},
      });
    });
  });

  return rows;
};

const getExportPayload = async (snapshot, dataset) => {
  switch (dataset) {
    case "households":
    case "household-info":
      return snapshot.households || [];
    case "submitted-forms":
    case "status":
      return toSubmittedFormsRows(snapshot.submittedForms);
    case "form-submissions":
      return toFormSubmissionRows(snapshot.formSubmissions);
    case "socio":
    case "seaf":
      return listDedicatedFormRows("seaf");
    case "engineering":
      return listDedicatedFormRows("engineering");
    case "inventory":
      return listDedicatedFormRows("inventory");
    case "snapshot":
      return snapshot;
    default:
      return null;
  }
};

const handleApi = async (req, res, pathname) => {
  if (req.method === "OPTIONS") {
    sendText(res, 204, "");
    return true;
  }

  if (req.method === "GET" && pathname === "/api/health") {
    const ok = await healthCheck();
    sendJson(res, ok ? 200 : 503, {
      ok,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  if (req.method === "POST" && (pathname === "/api/management/login" || pathname === "/api/admin/login")) {
    const body = await readRequestBody(req);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      sendJson(res, 400, { error: "Email and password are required." });
      return true;
    }

    const adminUser = await findAdminUserByEmail(email);

    if (adminUser) {
      if (!adminUser.is_active) {
        sendJson(res, 403, { error: "Admin user is inactive." });
        return true;
      }

      const passwordMatches = await bcrypt.compare(password, adminUser.password_hash);
      if (!passwordMatches) {
        sendJson(res, 401, { error: "Invalid management credentials." });
        return true;
      }

      sendJson(res, 200, {
        ok: true,
        user: {
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
        },
        session: {
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
        },
      });
      return true;
    }

    const adminUserCount = await countAdminUsers();
    const fallbackUser = management.user;

    if (adminUserCount > 0 || !fallbackUser || fallbackUser.email !== email || fallbackUser.password !== password) {
      sendJson(res, 401, { error: "Invalid management credentials." });
      return true;
    }

    sendJson(res, 200, {
      ok: true,
      user: {
        email: fallbackUser.email,
        name: fallbackUser.name,
        role: fallbackUser.role || "admin",
      },
      session: {
        email: fallbackUser.email,
        name: fallbackUser.name,
        role: fallbackUser.role || "admin",
      },
    });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/db") {
    sendJson(res, 200, await getSnapshot());
    return true;
  }

  if (req.method === "GET" && pathname === "/api/export") {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
    const dataset = String(requestUrl.searchParams.get("dataset") || "households").trim().toLowerCase();
    const format = String(requestUrl.searchParams.get("format") || "json").trim().toLowerCase();

    if (!exportableDatasets.has(dataset)) {
      sendJson(res, 400, { error: "Unsupported export dataset." });
      return true;
    }

    if (!["json", "csv"].includes(format)) {
      sendJson(res, 400, { error: "Unsupported export format." });
      return true;
    }

    if (dataset === "snapshot" && format === "csv") {
      sendJson(res, 400, { error: "Snapshot export is only available as JSON." });
      return true;
    }

    const snapshot = await getSnapshot();
    const payload = await getExportPayload(snapshot, dataset);
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      sendDownload(
        res,
        200,
        `${JSON.stringify(payload, null, 2)}\n`,
        `shehersaaz-${dataset}-${dateStamp}.json`,
        "application/json; charset=utf-8"
      );
      return true;
    }

    const rows = Array.isArray(payload) ? payload : [];
    sendDownload(
      res,
      200,
      toCsv(rows),
      `shehersaaz-${dataset}-${dateStamp}.csv`,
      "text/csv; charset=utf-8"
    );
    return true;
  }

  if (req.method === "GET" && pathname === "/api/households") {
    sendJson(res, 200, await listHouseholds());
    return true;
  }

  if (req.method === "POST" && pathname === "/api/households") {
    const body = await readRequestBody(req);
    if (!body || typeof body !== "object") {
      sendJson(res, 400, { error: "Invalid JSON body." });
      return true;
    }

    const householdId = String(body.householdId || "").trim();
    if (!householdId) {
      sendJson(res, 400, { error: "householdId is required." });
      return true;
    }

    const record = await upsertHousehold(householdId, body);
    sendJson(res, 200, record);
    return true;
  }

  if (req.method === "GET" && pathname.startsWith("/api/households/")) {
    const householdId = decodeURIComponent(pathname.replace("/api/households/", ""));
    const record = await getHouseholdById(householdId);
    if (!record) {
      sendJson(res, 404, { error: "Household not found." });
      return true;
    }

    sendJson(res, 200, record);
    return true;
  }

  if (req.method === "POST" && pathname.startsWith("/api/forms/") && pathname.endsWith("/submit")) {
    const parts = pathname.split("/").filter(Boolean);
    const formKey = parts[2];

    if (!allowedForms.has(formKey)) {
      sendJson(res, 400, { error: "Unsupported form key." });
      return true;
    }

    const body = await readRequestBody(req);
    if (!body || typeof body !== "object") {
      sendJson(res, 400, { error: "Invalid JSON body." });
      return true;
    }

    const householdId = String(body.householdId || "").trim();
    if (!householdId) {
      sendJson(res, 400, { error: "householdId is required." });
      return true;
    }

    const result = await submitForm({
      householdId,
      formKey,
      status: body.status || "Submitted",
      headName: body.headName || "",
      payload: body.payload && typeof body.payload === "object" ? body.payload : {},
      householdPatch: body.householdPatch && typeof body.householdPatch === "object" ? body.householdPatch : {},
    });

    sendJson(res, 200, result);
    return true;
  }

  if (req.method === "GET" && pathname.startsWith("/api/forms/")) {
    const parts = pathname.split("/").filter(Boolean);
    const formKey = parts[2];
    const householdId = parts[3];

    if (!allowedForms.has(formKey) || !householdId) {
      sendJson(res, 400, { error: "Invalid form lookup." });
      return true;
    }

    const entry = await getFormSubmission(formKey, householdId);
    sendJson(res, 200, entry);
    return true;
  }

  return false;
};

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  const pathname = requestUrl.pathname;

  try {
    if (pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, pathname);
      if (handled) {
        return;
      }
    }

    const served = serveStatic(req, res, pathname, frontendDir);
    if (served) {
      return;
    }

    sendText(res, 404, "Not found");
  } catch (error) {
    sendJson(res, 500, {
      error: "Internal server error.",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use on ${host}. Stop the other server process or change PORT in backend/.env.`);
    process.exitCode = 1;
    return;
  }

  console.error("Unexpected server error:", error);
  process.exitCode = 1;
});

initializeDatabase()
  .then(() => {
    server.listen(port, host, () => {
      console.log(`Shehersaaz backend listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize the MySQL backend:", error);
    process.exitCode = 1;
  });
