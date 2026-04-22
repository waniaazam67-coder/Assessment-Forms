const http = require("node:http");
const { URL } = require("node:url");
const { projectRoot, host, port } = require("./config");
const { healthCheck, initializeDatabase, listHouseholds, getHouseholdById, getFormSubmission, getSnapshot, upsertHousehold, submitForm } = require("./db");
const { sendJson, sendText, readRequestBody, serveStatic } = require("./http");

const allowedForms = new Set(["household", "seaf", "engineering", "inventory"]);

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

  if (req.method === "GET" && pathname === "/api/db") {
    sendJson(res, 200, await getSnapshot());
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

    const served = serveStatic(req, res, pathname, projectRoot);
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

initializeDatabase()
  .then(() => {
    server.listen(port, host, () => {
      console.log(`Shehersaaz backend running at http://${host}:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize the MySQL backend:", error);
    process.exitCode = 1;
  });
