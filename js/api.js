(() => {
  const STORAGE_KEY = "INTERVIEWAI_API_BASE_URL";
  const FALLBACK_BASE_URL = "http://127.0.0.1:5000";
  const PING_PATH = "/ping";
  const PING_EXPECTED = "pong";

  function normalizeBaseUrl(value) {
    const baseUrl = String(value || "").trim();
    if (!baseUrl) return "";
    return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  }

  function buildUrl(baseUrl, path) {
    if (!path || typeof path !== "string") {
      throw new Error("api.fetch: path must be a string");
    }
    if (!path.startsWith("/")) {
      throw new Error(`api.fetch: path must start with '/': ${path}`);
    }
    return baseUrl ? `${baseUrl}${path}` : path;
  }

  async function probePing(baseUrl, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(buildUrl(baseUrl, PING_PATH), {
        method: "GET",
        cache: "no-store",
        signal: controller.signal
      });
      const text = await res.text();
      return text.trim() === PING_EXPECTED;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveBaseUrl() {
    const stored =
      normalizeBaseUrl(localStorage.getItem(STORAGE_KEY)) ||
      normalizeBaseUrl(localStorage.getItem("API_BASE_URL"));
    if (stored) return stored;

    // Prefer same-origin when the backend is serving the frontend.
    if (await probePing("", 1200)) return "";

    // Fallback for "static frontend on another port" development.
    if (await probePing(FALLBACK_BASE_URL, 1200)) return FALLBACK_BASE_URL;

    // Final fallback: if we are on http(s) use same-origin, otherwise use fallback.
    if (window.location?.protocol && window.location.protocol !== "file:") return "";
    return FALLBACK_BASE_URL;
  }

  const api = {
    baseUrl: FALLBACK_BASE_URL,
    ready: null,
    async fetch(path, options) {
      await api.ready;
      return fetch(buildUrl(api.baseUrl, path), options);
    },
    setBaseUrl(value) {
      const normalized = normalizeBaseUrl(value);
      localStorage.setItem(STORAGE_KEY, normalized);
      api.baseUrl = normalized;
    }
  };

  api.ready = resolveBaseUrl().then((resolved) => {
    api.baseUrl = resolved;
    return resolved;
  });

  window.InterviewAI = window.InterviewAI || {};
  window.InterviewAI.api = api;
})();

