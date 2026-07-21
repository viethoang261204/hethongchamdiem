// Simple in-memory cache for API responses
// Key: apiMethodName + JSON.stringify(args)
// TTL: 2 phút — giảm số request lên backend/Neon free tier

const cache = new Map();
const TTL_MS = 120000;

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

// Cache-busting: gọi clearApiCache() khi có thao tác create/update/delete.
// Nếu truyền prefix (vd: 'getScores', 'getTeams'), chỉ xoá các key liên quan
// thay vì nuke toàn bộ cache — tránh cascade re-fetch không cần thiết.
export function clearApiCache(prefix) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix + ':')) cache.delete(key);
  }
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
