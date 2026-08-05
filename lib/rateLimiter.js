import { mysqlPool } from "@/lib/db";

// Cached on globalThis for the same reason lib/db.js caches the connection
// pool there — Next.js can re-evaluate this module (dev hot-reload, and per
// the proxy.js docs: "you should not attempt relying on shared modules or
// globals" between Proxy and the rest of the app is a real risk in some
// deployment modes) so a plain module-level variable isn't guaranteed to
// survive. globalThis is the one thing that reliably persists across all of
// that within a single Node.js process — which this app always is, since
// it's deployed as one `next start` container (see Dockerfile), not a
// distributed multi-instance/edge setup.
const g = globalThis;

// Live request-count buckets, keyed by `${ruleKey}:${ip}`.
const buckets = g.__imsRateLimitBuckets || new Map();
if (!g.__imsRateLimitBuckets) g.__imsRateLimitBuckets = buckets;

// Rule config (windowMs/maxRequests per ruleKey), loaded from the
// `rate_limit_rules` table and refreshed periodically so an admin's change
// takes effect within a few seconds without needing a server restart, while
// still avoiding a DB round-trip on every single request.
let rulesCache = g.__imsRateLimitRulesCache || null;
let rulesCacheAt = g.__imsRateLimitRulesCacheAt || 0;
const RULES_TTL_MS = 10 * 1000;

const DEFAULT_RULES = {
  login: { windowMs: 15 * 60 * 1000, maxRequests: 8, label: "Login attempts" },
  general: { windowMs: 60 * 1000, maxRequests: 300, label: "All API requests" },
};

async function loadRules() {
  const now = Date.now();
  if (rulesCache && now - rulesCacheAt < RULES_TTL_MS) return rulesCache;
  try {
    const [rows] = await mysqlPool.query("SELECT ruleKey, label, windowMs, maxRequests FROM rate_limit_rules");
    const byKey = {};
    for (const r of rows) byKey[r.ruleKey] = { windowMs: r.windowMs, maxRequests: r.maxRequests, label: r.label };
    rulesCache = { ...DEFAULT_RULES, ...byKey };
  } catch (err) {
    // DB hiccup shouldn't take down every request in the app — fall back to
    // defaults (or whatever was last cached) rather than throwing here.
    console.error("Failed to load rate_limit_rules, using cached/default:", err.message);
    rulesCache = rulesCache || DEFAULT_RULES;
  }
  rulesCacheAt = now;
  g.__imsRateLimitRulesCache = rulesCache;
  g.__imsRateLimitRulesCacheAt = rulesCacheAt;
  return rulesCache;
}

export function invalidateRulesCache() {
  rulesCache = null;
  rulesCacheAt = 0;
  g.__imsRateLimitRulesCache = null;
  g.__imsRateLimitRulesCacheAt = 0;
}

function sweepExpired(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// `ruleKeyForPath` — which rule applies to a given API path. Only two tiers
// today (login vs. everything else under /api/*); add more entries here
// (and a matching row in rate_limit_rules) if a specific route ever needs
// its own ceiling.
export function ruleKeyForPath(pathname) {
  if (pathname === "/api/auth/login") return "login";
  if (pathname.startsWith("/api/")) return "general";
  return null;
}

export async function checkRateLimit(pathname, ip) {
  const ruleKey = ruleKeyForPath(pathname);
  if (!ruleKey) return null;

  const rules = await loadRules();
  const rule = rules[ruleKey] || DEFAULT_RULES[ruleKey];

  const now = Date.now();
  if (Math.random() < 0.02) sweepExpired(now);

  const key = `${ruleKey}:${ip}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + rule.windowMs, ip, ruleKey };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  return {
    ruleKey,
    limit: rule.maxRequests,
    remaining: Math.max(0, rule.maxRequests - bucket.count),
    resetAt: bucket.resetAt,
    blocked: bucket.count > rule.maxRequests,
  };
}

const MAX_USERNAMES_PER_BUCKET = 5;

// Rate limiting is per-IP, but an admin trying to unblock someone needs to
// know *who* that IP belongs to — otherwise, with several IPs showing up as
// blocked, there's no way to tell which one is the urgent user versus some
// unrelated bot/script. The login route calls this on every failed attempt
// so the admin panel can show "this IP tried usernames: X, Y" next to the
// counter, making the right one to reset obvious instead of a guess.
export function recordLoginAttempt(ip, username) {
  const key = `login:${ip}`;
  const bucket = buckets.get(key);
  if (!bucket) return; // checkRateLimit always runs first via proxy.js, so this should already exist
  if (!bucket.usernames) bucket.usernames = [];
  const clean = String(username || "").trim();
  if (!clean) return;
  bucket.usernames = bucket.usernames.filter((u) => u !== clean);
  bucket.usernames.unshift(clean);
  if (bucket.usernames.length > MAX_USERNAMES_PER_BUCKET) bucket.usernames.length = MAX_USERNAMES_PER_BUCKET;
}

// Used by the admin "Rate Limiting" page to show what's currently being
// tracked — every active bucket (not expired), most recently active first.
export function getBucketSnapshot() {
  const now = Date.now();
  return Array.from(buckets.values())
    .filter((b) => b.resetAt > now)
    .map((b) => ({ ip: b.ip, ruleKey: b.ruleKey, count: b.count, resetAt: b.resetAt, usernames: b.usernames || [] }))
    .sort((a, b) => b.count - a.count);
}

export function clearBucket(ruleKey, ip) {
  buckets.delete(`${ruleKey}:${ip}`);
}
