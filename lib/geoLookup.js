// In-memory cache: ip -> { data, expiresAt }. Cached on globalThis to survive
// Next.js dev hot-reload the same way the DB pool and user cache are.
const globalForGeo = globalThis;
const cache = globalForGeo.__imsGeoCache || new Map();
if (!globalForGeo.__imsGeoCache) globalForGeo.__imsGeoCache = cache;
const TTL = 24 * 60 * 60 * 1000; // 24 hours

// Same probabilistic sweep pattern used in lib/auth.js and lib/rateLimiter.js
// — expiry was only ever checked on read, so an IP looked up once and never
// again sat in memory until the process restarted.
function sweepExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

function normalizeIp(ip) {
  if (!ip) return "";
  return ip.replace("::ffff:", "").trim();
}

function isPrivateIp(ip) {
  const cleaned = normalizeIp(ip);
  if (!cleaned || cleaned === "127.0.0.1" || cleaned === "::1" || cleaned === "unknown") return true;
  if (/^10\./.test(cleaned)) return true;
  if (/^192\.168\./.test(cleaned)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(cleaned)) return true;
  return false;
}

async function getLocation(ip) {
  const cleaned = normalizeIp(ip);
  if (!cleaned) return { city: null, country: null, label: "Unknown" };
  if (isPrivateIp(cleaned)) return { city: null, country: null, label: "Local Network" };

  const cached = cache.get(cleaned);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const response = await fetch(`http://ip-api.com/json/${cleaned}?fields=status,city,regionName,country,query`);
    const json = await response.json();
    const data = json.status === "success"
      ? { city: json.city || null, country: json.country || null, label: [json.city, json.country].filter(Boolean).join(", ") || "Unknown" }
      : { city: null, country: null, label: "Unknown" };
    if (Math.random() < 0.02) sweepExpired();
    cache.set(cleaned, { data, expiresAt: Date.now() + TTL });
    return data;
  } catch {
    return { city: null, country: null, label: "Unknown" };
  }
}

export async function getLocationsForIps(ips) {
  const uniqueIps = [...new Set(ips.map(normalizeIp).filter(Boolean))];
  const results = await Promise.all(uniqueIps.map(async (ip) => [ip, await getLocation(ip)]));
  return new Map(results);
}

export { getLocation, isPrivateIp, normalizeIp };
