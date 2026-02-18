function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function isValidPassword(password) {
  return String(password || "").length >= 6;
}

function normalizeText(value, maxLen = 5000) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, Math.max(1, Number(maxLen) || 1));
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  isValidPassword,
  normalizeText
};
