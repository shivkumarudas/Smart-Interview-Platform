function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function defaultKeyGenerator(req) {
  const ip = String(req?.ip || req?.socket?.remoteAddress || "unknown").trim();
  return ip || "unknown";
}

function createRateLimiter(options = {}) {
  const windowMs = toPositiveInt(options.windowMs, 15 * 60 * 1000);
  const max = toPositiveInt(options.max, 10);
  const statusCode = toPositiveInt(options.statusCode, 429);
  const maxEntries = toPositiveInt(options.maxEntries, 5000);
  const message = String(options.message || "Too many requests. Please try again shortly.");
  const keyGenerator =
    typeof options.keyGenerator === "function" ? options.keyGenerator : defaultKeyGenerator;
  const store = new Map();

  function cleanup(now) {
    for (const [key, entry] of store.entries()) {
      if (!entry || now >= entry.resetAt) {
        store.delete(key);
      }
    }
  }

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const rawKey = String(keyGenerator(req) || "").trim() || "unknown";
    const key = rawKey.slice(0, 256);

    let entry = store.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + windowMs
      };
    }

    entry.count += 1;
    store.set(key, entry);

    const remaining = Math.max(0, max - entry.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.floor(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(statusCode).json({
        error: message,
        retryAfterSeconds
      });
    }

    if (store.size > maxEntries || Math.random() < 0.01) {
      cleanup(now);
    }

    return next();
  };
}

module.exports = {
  createRateLimiter
};
