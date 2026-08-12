import { mysqlPool } from "./db";
import {
  sanitizeUser,
  normalizeRole,
  safeStr,
  normalizeBusinessStatus,
  normalizeLogisticsStatus,
  verifyToken,
} from "./helpers";
import { trackActivity } from "./sessionTracker";

export const isSuperUser = (role) => role === "Admin";

// Thrown by the guard helpers below; route handlers catch it via `jsonError()`.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// 30-second in-memory user cache — avoids a DB query on every request (ported
// from Backend4/middleware/auth.js; cached on globalThis to survive Next.js
// dev hot-reload the same way the DB pool is).
const globalForCache = globalThis;
const _userCache = globalForCache.__imsUserCache || new Map();
if (!globalForCache.__imsUserCache) globalForCache.__imsUserCache = _userCache;
const USER_CACHE_TTL = 30_000;

// Both caches only evict a stale entry when that exact key is read again —
// a user/company that's looked up once and never again would otherwise sit
// in memory until the process restarts. Practically bounded (can't exceed
// the real user/company count) so this was never a real leak, but a cheap
// probabilistic sweep on cache writes keeps it tidy without adding a timer.
function _sweepExpired(map, now) {
  for (const [key, entry] of map) {
    if (now > entry.exp) map.delete(key);
  }
}

function _getCached(userId) {
  const entry = _userCache.get(String(userId));
  if (!entry || Date.now() > entry.exp) { _userCache.delete(String(userId)); return null; }
  return entry.user;
}
function _setCache(userId, user) {
  if (Math.random() < 0.02) _sweepExpired(_userCache, Date.now());
  _userCache.set(String(userId), { user, exp: Date.now() + USER_CACHE_TTL });
}
export function invalidateUserCache(userId) {
  _userCache.delete(String(userId));
}
export function clearAllUserCache() { _userCache.clear(); }
export function getCacheSize() { return _userCache.size; }

async function getUserByToken(token) {
  const payload = verifyToken(token);
  if (!payload) return null;

  const cached = _getCached(payload.id);
  if (cached) {
    if (cached.forceLogoutAt && new Date(cached.forceLogoutAt).getTime() > payload.iat * 1000) {
      invalidateUserCache(payload.id);
      return null;
    }
    return cached;
  }

  // Role-based access (not per-user override): permissions/edit-flags now
  // come from the user's assigned role row, not the user's own stored
  // columns — join it in the same cached query so this stays a single query
  // per login (cached 30s below) rather than a second lookup per request.
  const [rows] = await mysqlPool.query(
    `SELECT u.*, r.permissions as rolePermissions, r.editPermissions as roleEditPermissions
     FROM users u LEFT JOIN roles r ON u.roleId = r.guid AND r.isDeleted = 0
     WHERE u.userid = ? LIMIT 1`,
    [payload.id]
  );
  const user = rows[0];
  if (!user) return null;
  if (user.forceLogoutAt && new Date(user.forceLogoutAt).getTime() > payload.iat * 1000) return null;
  _setCache(payload.id, user);
  return user;
}

function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim() || null;
  return null;
}

// Resolves the authenticated user (or null) for a route handler. Call this
// first in every handler — mirrors Backend4's global `attachAuthenticatedUser`.
export async function getAuthenticatedUser(request) {
  const token = getBearerToken(request);
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    const user = await getUserByToken(token);
    if (!user) return null;
    const sanitized = sanitizeUser(user);
    if (sanitized && payload?.companyId) {
      sanitized.companyId = payload.companyId;
    }
    return sanitized;
  } catch (err) {
    console.error("[auth] getAuthenticatedUser:", err.message);
    throw new ApiError(500, "An internal server error occurred.");
  }
}

// Resolves a user's role assignment from a client-supplied `roleId` —
// authoritatively, server-side. No role name is predefined: `roleId` is
// either the "admin" sentinel (hardcoded superuser, never a DB row) or the
// guid of a row an admin created in Manage Roles. Returns { role, roleId }
// where `role` is just a display copy of the role's current name.
export async function resolveRole(roleId) {
  if (roleId === "admin") return { role: "Admin", roleId: null };
  if (roleId) {
    const [rows] = await mysqlPool.query("SELECT guid, name FROM roles WHERE guid=? AND isDeleted=0 LIMIT 1", [roleId]);
    if (rows.length) return { role: rows[0].name, roleId: rows[0].guid };
  }
  return { role: "", roleId: null };
}

export function requireAuth(user) {
  if (!user) throw new ApiError(401, "Authentication required");
}

export function requireCompany(user) {
  requireAuth(user);
  if (!user.companyId) throw new ApiError(401, "No active company (Authentication expired)");
}

// Resolves which company a request should be scoped to, honoring an optional
// `?companyGuid=` override (used by the Dashboard's company filter for users
// who can see beyond their own active company). Returns `null` to mean
// "no company filter — show every company" (only ever returned when the
// caller is authorized for it); otherwise a specific guid to filter by.
// Admin always sees every company; anyone else needs the allCompaniesAccess
// flag explicitly set on their account.
export function hasAllCompaniesAccess(user) {
  const role = normalizeRole(user?.role);
  return !!user?.allCompaniesAccess || role === "Admin";
}

export function resolveScopedCompanyGuid(user, request) {
  requireCompany(user);
  const requested = new URL(request.url).searchParams.get("companyGuid");
  if (!requested || requested === user.companyId) return user.companyId;

  if (!hasAllCompaniesAccess(user)) throw new ApiError(403, "You do not have access to that company's data.");

  return requested === "all" ? null : requested;
}

// 30-second cache for a company's isActive flag — same rationale as the user
// cache above (avoid a DB hit on every request), keyed separately since it
// varies per companyId rather than per userId/token.
const _companyActiveCache = globalForCache.__imsCompanyActiveCache || new Map();
if (!globalForCache.__imsCompanyActiveCache) globalForCache.__imsCompanyActiveCache = _companyActiveCache;
const COMPANY_CACHE_TTL = 30_000;

export function invalidateCompanyActiveCache(companyGuid) {
  _companyActiveCache.delete(companyGuid);
}

async function isCompanyActive(companyGuid) {
  const cached = _companyActiveCache.get(companyGuid);
  if (cached && Date.now() < cached.exp) return cached.active;
  const [rows] = await mysqlPool.query("SELECT isActive FROM companies WHERE guid = ?", [companyGuid]);
  // Missing row shouldn't happen for a real companyId — fail open rather
  // than locking everyone out over a data inconsistency.
  const active = rows.length === 0 || !!rows[0].isActive;
  if (Math.random() < 0.02) _sweepExpired(_companyActiveCache, Date.now());
  _companyActiveCache.set(companyGuid, { active, exp: Date.now() + COMPANY_CACHE_TTL });
  return active;
}

// Endpoints a user must still be able to reach even while their session's
// active company is deactivated — switching away from it, checking who they
// are, and logging out.
const COMPANY_GATE_EXEMPT_PATHS = ["/api/auth/switch-company", "/api/auth/me", "/api/auth/logout", "/api/companies"];

// Composite of Backend4's global middleware chain
// (attachAuthenticatedUser -> trackActivity). Call this first in every route
// handler instead of getAuthenticatedUser() directly, so session tracking is
// never accidentally skipped.
export async function authenticateRequest(request) {
  const user = await getAuthenticatedUser(request);

  if (user?.companyId) {
    const { pathname } = new URL(request.url);
    const exempt = COMPANY_GATE_EXEMPT_PATHS.some((p) => pathname.startsWith(p));
    if (!exempt && !(await isCompanyActive(user.companyId))) {
      throw new ApiError(403, "COMPANY_DEACTIVATED: Your active company has been deactivated. Please switch to another company or contact your administrator.");
    }
  }

  trackActivity(user, request);
  return user;
}

export function requireRoles(user, roles, message = "You do not have permission to perform this action.") {
  requireAuth(user);
  if (isSuperUser(normalizeRole(user.role))) return;
  if (!roles.includes(normalizeRole(user.role))) throw new ApiError(403, message);
}

export function requirePermission(user, permission, message = "You do not have the required power to access this feature.") {
  requireAuth(user);
  if (isSuperUser(normalizeRole(user.role))) return;
  if (user.permissions && user.permissions.includes(permission)) return;
  throw new ApiError(403, message);
}

export function requireEditPermission(user, columnName) {
  requireAuth(user);
  if (isSuperUser(normalizeRole(user.role))) return;
  if (user[columnName]) return;
  throw new ApiError(403, "You do not have permission to edit this module.");
}

// Role-name-free authorization gate: read access comes from the user's role
// permission list (`permission`, a PERMISSIONS_LIST id — resolved from the
// user's assigned role, see sanitizeUser), write/delete access comes from an
// edit-flag (`editColumnName`, an allow_edit_* key — also role-resolved).
// `adminOnlyDelete` covers the handful of routes where deletion is
// intentionally Admin-only regardless of edit-flag (isSuperUser already
// bypasses everything above, so this only fires for non-Admin DELETEs).
export function authorizeReadWrite(user, method, { permission, editColumnName = null, adminOnlyDelete = false, denyMessage = "You do not have permission to perform this action." }) {
  requireAuth(user);
  if (isSuperUser(normalizeRole(user.role))) return;
  const m = method.toUpperCase();

  if (["GET", "HEAD", "OPTIONS"].includes(m)) {
    if (permission && user.permissions?.includes(permission)) return;
    throw new ApiError(403, denyMessage);
  }
  if (m === "DELETE" && adminOnlyDelete) {
    throw new ApiError(403, denyMessage);
  }
  if (editColumnName && user[editColumnName]) return;
  throw new ApiError(403, denyMessage);
}

// Per-master CRUD authorization for the legacy /Inventory/* master-data
// routes (Category, Brand, Vendor, Item, Combo, Unit, Cate-Brand Mapping).
// Each master gets its own view permission (the existing stat_* ids) plus
// three independent edit-flags — allow_add_<key>/allow_edit_<key>/
// allow_delete_<key> — so a role can be granted add-only, edit-only, or
// delete rights per master instead of one shared switch for all of them.
export function authorizeMasterRead(user, viewPermission, denyMessage) {
  requirePermission(user, viewPermission, denyMessage || "You do not have permission to view this data.");
}

export function authorizeMasterWrite(user, masterKey, { isCreate, denyMessage } = {}) {
  requireAuth(user);
  if (isSuperUser(normalizeRole(user.role))) return;
  const flag = isCreate ? `allow_add_${masterKey}` : `allow_edit_${masterKey}`;
  if (user[flag]) return;
  throw new ApiError(403, denyMessage || `You do not have permission to ${isCreate ? "add" : "edit"} this record.`);
}

export function authorizeMasterDelete(user, masterKey, denyMessage) {
  requireAuth(user);
  if (isSuperUser(normalizeRole(user.role))) return;
  if (user[`allow_delete_${masterKey}`]) return;
  throw new ApiError(403, denyMessage || "You do not have permission to delete this record.");
}

const ACCOUNTANT_DISPATCH_FIELDS = new Set(["id", "ids", "status", "invoiceNumber", "invoiceDate", "ewayBillNumber", "gemBillUploaded", "invoiceFilename", "ewayBillFilename", "logisticsStatus", "commission"]);
const ACCOUNTANT_ALLOWED_DISPATCH_STATUSES = new Set(["Send for Billing", "Billed", "Payment Pending", "Completed"]);
const ACCOUNTANT_ALLOWED_LOGISTICS_STATUSES = new Set([null, "", "Packing in Process", "Delivered"]);

function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

function getDispatchUpdatePayloads(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.updates)) return body.updates;
  if (isPlainObject(body?.updates)) return [body.updates];
  if (isPlainObject(body)) return [body];
  return [];
}

function isAccountantDispatchUpdateAllowed(update) {
  if (!isPlainObject(update)) return false;
  const keys = Object.keys(update).filter((k) => update[k] !== undefined);
  if (!keys.length || !keys.every((k) => ACCOUNTANT_DISPATCH_FIELDS.has(k))) return false;
  if (update.status !== undefined && !ACCOUNTANT_ALLOWED_DISPATCH_STATUSES.has(normalizeBusinessStatus(update.status))) return false;
  if (update.logisticsStatus !== undefined && !ACCOUNTANT_ALLOWED_LOGISTICS_STATUSES.has(normalizeLogisticsStatus(update.logisticsStatus))) return false;
  return true;
}

export function isAccountantDispatchRequest(body) {
  const updates = getDispatchUpdatePayloads(body);
  return updates.length > 0 && updates.every(isAccountantDispatchUpdateAllowed);
}

export function authorizeDispatchRequest(user, method, body) {
  requireAuth(user);
  const m = method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(m)) return;
  if (isSuperUser(normalizeRole(user.role)) || user.allow_edit_dispatch) return;
  // Billing-only partial update (invoice/e-way/logistics fields) — gated by
  // the billing edit-flag, not a role name, so any role with billing-edit
  // rights can do this restricted subset of dispatch fields.
  if (user.allow_edit_billing && m === "PUT" && isAccountantDispatchRequest(body)) return;
  throw new ApiError(403, "This dispatch action is not allowed for your role.");
}

// Which order-document types a user can upload — driven by their role's
// edit-flags (allow_edit_order_processing / allow_edit_billing), not a
// hardcoded role name. allow_edit_order_processing covers every standard
// doc type (broad order-management access); allow_edit_billing alone still
// covers the billing-adjacent ones (invoice/ewayBill/pod) without needing
// full order-processing edit rights.
export function canManageOrderDocuments(user, docType) {
  const dt = safeStr(docType, "");
  if (isSuperUser(normalizeRole(user?.role))) return true;
  const standardTypes = ["invoice", "ewayBill", "pod", "gemContract"];
  if (!standardTypes.includes(dt)) return true;
  if (user?.allow_edit_order_processing) return true;
  if (user?.allow_edit_billing) return ["invoice", "ewayBill", "pod"].includes(dt);
  return false;
}

export function authorizeOrdersRequest(user, method, pathname, body) {
  requireAuth(user);
  const m = method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(m)) return;
  if (isSuperUser(normalizeRole(user.role))) return;
  if (m === "POST" && user.allow_create_order) return;
  if (pathname.endsWith("/payment") || pathname.endsWith("/batch-payment")) {
    if (user.allow_edit_billing) return;
    throw new ApiError(403, "Only Admin or a billing-edit role can update payments.");
  }
  if (["PUT", "PATCH", "DELETE"].includes(m) && user.allow_edit_order_processing) return;
  if (pathname.endsWith("/upload")) {
    // Coarse view-level gate — the per-doc-type rule (canManageOrderDocuments,
    // checked inside the upload route itself) does the real enforcement.
    if (user.permissions?.includes("orders")) return;
    throw new ApiError(403, "You cannot upload order documents.");
  }
  if (pathname.endsWith("/status") || pathname.endsWith("/replace") || pathname.endsWith("/warranty-start")) {
    if (user.allow_edit_order_processing) return;
    throw new ApiError(403, "You do not have permission to make this change.");
  }
  throw new ApiError(403, "This order action is not allowed for your role.");
}
