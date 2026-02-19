const jwt = require("jsonwebtoken");

const TOKEN_TTL = String(process.env.JWT_EXPIRES_IN || "7d").trim() || "7d";
const DEFAULT_DEV_SECRET = "dev-insecure-jwt-secret-change-me";
let hasWarnedMissingSecret = false;
const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";

function getJwtSecret() {
  const configured = String(process.env.JWT_SECRET || "").trim();
  if (configured) return configured;

  if (isProduction) {
    throw new Error("JWT_SECRET is required in production");
  }

  if (!hasWarnedMissingSecret) {
    hasWarnedMissingSecret = true;
    console.warn(
      "JWT_SECRET is not set. Using a temporary development secret. Set JWT_SECRET in .env."
    );
  }

  return DEFAULT_DEV_SECRET;
}

function assertAuthConfig() {
  getJwtSecret();
}

function issueAuthToken(user, mode = "database") {
  const userId = String(user?.id || user?._id || "").trim();
  if (!userId) {
    throw new Error("Cannot issue token without user id");
  }

  const payload = {
    sub: userId,
    email: String(user?.email || "").trim().toLowerCase(),
    name: String(user?.name || "").trim(),
    mode: String(mode || "").trim() || "database"
  };

  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_TTL });
}

function parseBearerToken(req) {
  const header = String(req?.headers?.authorization || "").trim();
  if (!header) return "";
  const [scheme, token] = header.split(/\s+/, 2);
  if (!/^bearer$/i.test(String(scheme || ""))) return "";
  return String(token || "").trim();
}

function requireAuth(req, res, next) {
  const token = parseBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Authorization required" });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const userId = String(decoded?.sub || decoded?.userId || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Invalid auth token" });
    }

    req.auth = {
      userId,
      email: String(decoded?.email || "").trim().toLowerCase(),
      name: String(decoded?.name || "").trim(),
      mode: String(decoded?.mode || "database").trim() || "database"
    };

    return next();
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired. Please login again." });
    }
    return res.status(401).json({ error: "Invalid auth token" });
  }
}

function requireSameUserIdFrom(fieldPath, label = "userId") {
  return (req, res, next) => {
    const [source, key] = String(fieldPath || "").split(".", 2);
    const sourceData = req?.[source];
    const value = String(sourceData?.[key] || "").trim();

    if (!value) {
      return res.status(400).json({ error: `Invalid ${label}` });
    }

    if (value !== req?.auth?.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  };
}

module.exports = {
  assertAuthConfig,
  issueAuthToken,
  requireAuth,
  requireSameUserIdFrom
};
