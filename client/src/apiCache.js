// Simple in-memory cache for API responses
// Key: apiMethodName + JSON.stringify(args)
// TTL: 30 seconds

const cache = new Map();
const TTL_MS = 30000;

function cacheKey(fnName, args) {
  return `${fnName}:${JSON.stringify(args)}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  cache.set(key, { value, expires: Date.now() + TTL_MS });
}

function clearCache() {
  cache.clear();
}

// Cache-busting: gọi clearApiCache() khi có thao tác create/update/delete
export function clearApiCache() {
  cache.clear();
}

// Wrap any api function to add caching
// Usage: cachedApi.getCompetitions() — tự cache 30s
export function createCachedApi(api) {
  const wrapped = {};
  for (const key of Object.keys(api)) {
    if (typeof api[key] === 'function') {
      wrapped[key] = async (...args) => {
        const key2 = cacheKey(key, args);
        const cached = getCached(key2);
        if (cached !== null) return cached;
        const result = await api[key](...args);
        setCached(key2, result);
        return result;
      };
    } else {
      wrapped[key] = api[key];
    }
  }
  return wrapped;
}
