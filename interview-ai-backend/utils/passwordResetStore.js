const crypto = require("crypto");

const store = new Map();

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getCodeTtlMs() {
  const minutes = toPositiveInt(process.env.PASSWORD_RESET_CODE_TTL_MINUTES, 15);
  return Math.max(1, Math.min(120, minutes)) * 60 * 1000;
}

function getMaxAttempts() {
  return Math.max(1, Math.min(10, toPositiveInt(process.env.PASSWORD_RESET_MAX_ATTEMPTS, 5)));
}

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code || "").trim()).digest("hex");
}

function generateResetCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function issueResetCode(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Email is required");
  }

  const code = generateResetCode();
  const now = Date.now();
  store.set(normalizedEmail, {
    codeHash: hashCode(code),
    createdAt: now,
    expiresAt: now + getCodeTtlMs(),
    attempts: 0
  });

  return code;
}

function verifyResetCode(email, code) {
  const normalizedEmail = normalizeEmail(email);
  const submittedCode = String(code || "").trim();
  if (!normalizedEmail || !submittedCode) {
    return { ok: false, reason: "invalid" };
  }

  const entry = store.get(normalizedEmail);
  if (!entry) {
    return { ok: false, reason: "invalid" };
  }

  const now = Date.now();
  if (now >= Number(entry.expiresAt || 0)) {
    store.delete(normalizedEmail);
    return { ok: false, reason: "expired" };
  }

  const maxAttempts = getMaxAttempts();
  if (Number(entry.attempts || 0) >= maxAttempts) {
    store.delete(normalizedEmail);
    return { ok: false, reason: "locked" };
  }

  if (hashCode(submittedCode) !== entry.codeHash) {
    entry.attempts = Number(entry.attempts || 0) + 1;
    if (entry.attempts >= maxAttempts) {
      store.delete(normalizedEmail);
      return { ok: false, reason: "locked" };
    }
    store.set(normalizedEmail, entry);
    return { ok: false, reason: "invalid" };
  }

  return { ok: true };
}

function clearResetCode(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;
  store.delete(normalizedEmail);
}

module.exports = {
  issueResetCode,
  verifyResetCode,
  clearResetCode
};
