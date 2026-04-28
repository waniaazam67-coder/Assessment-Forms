const path = require("node:path");
const dotenv = require("dotenv");

const backendDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(backendDir, "..");
const frontendDir = path.join(projectRoot, "public");

dotenv.config({ path: path.join(backendDir, ".env") });

const nodeEnv = String(process.env.NODE_ENV || "development").trim().toLowerCase() || "development";
const isProduction = nodeEnv === "production";

const toPort = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toDisplayName = (email, fallbackName = "") => {
  const normalizedFallback = String(fallbackName || "").trim();
  if (normalizedFallback) {
    return normalizedFallback;
  }

  return String(email || "")
    .split("@")[0]
    .replace(/[._]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const fallbackAdminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const fallbackAdminPassword = String(process.env.ADMIN_PASSWORD || process.env.MANAGEMENT_PASSWORD || "").trim();
const fallbackAdminName = String(process.env.ADMIN_NAME || "").trim();
const allowEnvAdminFallback = String(process.env.ALLOW_ENV_ADMIN_FALLBACK || "")
  .trim()
  .toLowerCase() === "true";
const fallbackAdminUser =
  fallbackAdminEmail && fallbackAdminPassword && (!isProduction || allowEnvAdminFallback)
    ? {
        email: fallbackAdminEmail,
        password: fallbackAdminPassword,
        name: toDisplayName(fallbackAdminEmail, fallbackAdminName),
        role: "admin",
      }
    : null;

const allowedOrigins = Array.from(
  new Set(
    String(process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  )
);

module.exports = {
  backendDir,
  projectRoot,
  frontendDir,
  nodeEnv,
  isProduction,
  dataDir: path.join(backendDir, "data"),
  legacyDbFile: path.join(backendDir, "data", "db.json"),
  host: process.env.HOST || "127.0.0.1",
  port: toPort(process.env.PORT, 4000),
  allowedOrigins,
  security: {
    sessionTtlMs: toPositiveInteger(process.env.ADMIN_SESSION_TTL_MS, 1000 * 60 * 60 * 8),
    loginWindowMs: toPositiveInteger(process.env.ADMIN_LOGIN_WINDOW_MS, 1000 * 60 * 15),
    maxLoginAttempts: toPositiveInteger(process.env.ADMIN_LOGIN_MAX_ATTEMPTS, 5),
  },
  management: {
    user: fallbackAdminUser,
  },
  db: {
    host: process.env.DB_HOST || "localhost",
    port: toPort(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "shehersaaz_forms",
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: false,
    dateStrings: true,
  },
};
