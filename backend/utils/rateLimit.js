// Small in-memory fixed-window limiter: at most `limit` hits per key within `windowMs`.
// Used for failed logins and password-reset requests.
const createLimiter = ({ limit, windowMs }) => {
  const hits = new Map();

  const isBlocked = (key) => {
    const entry = hits.get(key);
    if (!entry) return false;
    if (Date.now() - entry.first > windowMs) {
      hits.delete(key);
      return false;
    }
    return entry.count >= limit;
  };

  const hit = (key) => {
    const entry = hits.get(key);
    if (!entry || Date.now() - entry.first > windowMs) {
      hits.set(key, { count: 1, first: Date.now() });
    } else {
      entry.count += 1;
    }
  };

  const reset = (key) => hits.delete(key);

  // Drop expired entries so the map cannot grow without limit
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.first > windowMs) hits.delete(key);
    }
  }, windowMs).unref();

  return { isBlocked, hit, reset };
};

module.exports = { createLimiter };
