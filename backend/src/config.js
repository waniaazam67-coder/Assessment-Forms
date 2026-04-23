const path = require("node:path");
const dotenv = require("dotenv");

const backendDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(backendDir, "..");
const frontendDir = path.join(projectRoot, "frontend");

dotenv.config({ path: path.join(backendDir, ".env") });

const toPort = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  backendDir,
  projectRoot,
  frontendDir,
  dataDir: path.join(backendDir, "data"),
  legacyDbFile: path.join(backendDir, "data", "db.json"),
  host: process.env.HOST || "127.0.0.1",
  port: toPort(process.env.PORT, 3000),
  db: {
    host: process.env.DB_HOST || "localhost",
    port: toPort(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "mysql@123",
    database: process.env.DB_NAME || "shehersaaz_forms",
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: false,
    dateStrings: true,
  },
};
