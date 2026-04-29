const fs = require("node:fs");
const path = require("node:path");

const {
  allowedOrigins,
} = require("./config");

const baseHeaders = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const getOriginHeader = (req) => String(req?.headers?.origin || "").trim();

const getResponseHeaders = (req, extraHeaders = {}) => {
  const origin = getOriginHeader(req);
  const headers = {
    ...baseHeaders,
    ...extraHeaders,
  };

  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }

  return headers;
};

const sendJson = (req, res, statusCode, data) => {
  res.writeHead(statusCode, {
    ...getResponseHeaders(req),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data));
};

const sendText = (req, res, statusCode, text, contentType = "text/plain; charset=utf-8") => {
  res.writeHead(statusCode, {
    ...getResponseHeaders(req),
    "Content-Type": contentType,
  });
  res.end(text);
};

const sendDownload = (req, res, statusCode, body, filename, contentType) => {
  res.writeHead(statusCode, {
    ...getResponseHeaders(req),
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
  res.end(body);
};

const readRequestBody = async (req) => {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
};

const safeStaticPath = (requestPath, projectRoot) => {
  const normalized = path.normalize(decodeURIComponent(requestPath)).replace(/^([.][\\/])+/, "");
  const relative = normalized.replace(/^([\\/])+/, "");
  const candidate = path.resolve(projectRoot, relative);
  return candidate.startsWith(projectRoot) ? candidate : null;
};

const serveStatic = (req, res, pathname, projectRoot) => {
  let relativePath = pathname;

  if (relativePath === "/") {
    res.writeHead(302, {
      Location: "/pages/admin-dashboard/index.html",
      ...getResponseHeaders(req),
    });
    res.end();
    return true;
  }

  if (relativePath.endsWith("/")) {
    relativePath += "index.html";
  }

  const filePath = safeStaticPath(relativePath, projectRoot);
  if (!filePath) {
    return false;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }

  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    ...getResponseHeaders(req),
    "Content-Type": getContentType(filePath),
  });
  res.end(body);
  return true;
};

module.exports = {
  getResponseHeaders,
  sendJson,
  sendText,
  sendDownload,
  readRequestBody,
  serveStatic,
};
