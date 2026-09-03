import fs from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Ported verbatim from Backend4/helpers.js (CommonJS -> ES module only).

export const safeDate = (v) => (v && v !== "" ? v : null);

// companies.allowedPlatforms is a JSON column — mysql2 auto-parses it to an
// array on some MySQL/driver configurations but hands back the raw JSON
// string on others (seen in production). Every place that reads this column
// for the frontend needs to tolerate both, or a saved selection like ["GeM"]
// silently reads back as "not an array" and renders as if nothing were
// selected (i.e. "all platforms").
export const parseAllowedPlatforms = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

export const safeNum = (val, fallback = 0) => {
  const n = Number(val);
  return Number.isNaN(n) ? fallback : n;
};

export const safeStr = (val, fallback = null) => {
  if (val === undefined || val === null) return fallback;
  const v = String(val).trim();
  return v === "" ? fallback : v;
};

export const toBit = (val) =>
  val === true || val === 1 || val === "1" || val === "true" || val === "TRUE" || val === "Yes" || val === "yes";

// No role names are predefined anymore — "Admin" is the only special one
// (hardcoded superuser, never a DB row). Every other role is whatever name
// the admin gave it in Manage Roles; this just normalizes casing/whitespace
// and preserves "Admin" as a fixed literal.
export const normalizeRole = (role) => {
  const value = safeStr(role, "");
  if (!value) return "";
  return value.toLowerCase() === "admin" ? "Admin" : value;
};

// Canonical order/dispatch status strings, as used verbatim throughout
// app/api (e.g. `o.status NOT IN ('Returned','Order Cancelled')`,
// `status === "Order Cancelled"`). Despite the name, this used to just
// default a missing status to "Pending" without correcting case/whitespace
// — a status stored as "order cancelled" or " Returned " would silently
// fail every one of those exact-match/IN checks elsewhere. Now it maps
// case/whitespace-insensitively onto the canonical spelling when it
// recognizes one, and only falls back to the trimmed raw value otherwise
// (so an unrecognized status isn't silently coerced into something wrong).
const CANONICAL_BUSINESS_STATUSES = [
  "Draft", "Pending", "Order Confirmed", "Order Cancelled", "Delivered",
  "Returned", "Partially Returned", "Send for Billing", "Billed",
  "Payment Pending", "Completed",
];
export const normalizeBusinessStatus = (status) => {
  const raw = safeStr(status, "Pending");
  const match = CANONICAL_BUSINESS_STATUSES.find((s) => s.toLowerCase() === raw.toLowerCase());
  return match || raw;
};

export const normalizeLogisticsStatus = (status) => {
  const s = safeStr(status, null);
  if (!s) return null;
  return s === "Ready for Dispatch" ? "Packing in Process" : s;
};

export const mapDispatchRow = (row) => {
  if (!row) return row;
  const orderIdStr = String(row.orderid || row.customerName || "");
  const defaultPlatform = orderIdStr.startsWith("GEM") ? "GeM" : "Unknown";
  return {
    ...row,
    firmName: row.platform || row.firmName || defaultPlatform,
    customerName: row.orderid !== undefined ? row.orderid : row.customerName,
  };
};

const ALL_PERMISSION_IDS = [
  "dashboard","print_models","print_serials","warranty","orders","billing","dispatch",
  "stat_category","stat_brand","stat_vendor","stat_item","stat_combo","stat_mapping","stat_unit",
  "stat_stock_in","stat_stock_out","stat_current_stock","installation","damage","returns",
  "notifications","users","roles","userActivity","reports","godownMaster","godownTransfer",
  "fbfFbaMaster","fbfFbaManagement",
  "companyMaster","platformMaster","deliveryPartnerMaster","contracts","emailAccounts","emailTemplates","emailInbox",
  "sentEmails","apiLogs","backupRestore","rateLimitSettings","aiSettings","googleDrive",
];
const MASTER_KEYS = ["category", "brand", "vendor", "item", "combo", "unit", "mapping"];
const MASTER_EDIT_KEYS = MASTER_KEYS.flatMap((k) => [`allow_add_${k}`, `allow_edit_${k}`, `allow_delete_${k}`]);

// Tabs that previously had only one bundled view permission (no separate
// create/edit/delete control) — each gets a real Add/Edit/Delete triple via
// authorizeMasterWrite/authorizeMasterDelete, same as the Master Data keys.
const FULL_CRUD_KEYS = ["roles", "companyMaster", "platformMaster", "deliveryPartnerMaster", "users", "emailAccounts", "emailTemplates"]
  .flatMap((k) => [`allow_add_${k}`, `allow_edit_${k}`, `allow_delete_${k}`]);

const ALL_EDIT_KEYS = [
  "allow_edit_models","allow_edit_serials","allow_edit_godown","allow_transfer_godown","allow_create_order",
  "allow_edit_order_processing","allow_edit_billing","allow_edit_dispatch","allow_edit_installations",
  "allow_edit_damaged","allow_edit_returns","allow_edit_fbf_fba","allow_edit_warranty","allow_edit_inventory",
  "allow_manage_platform_fields",
  ...MASTER_EDIT_KEYS,
  ...FULL_CRUD_KEYS,
];

const parseJsonArray = (val) => {
  try {
    const parsed = typeof val === "string" ? JSON.parse(val) : val;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Role-based access: Admin (hardcoded, never a DB row) gets every permission
// and edit-flag unconditionally. Everyone else's access comes from their
// assigned role's `permissions`/`editPermissions` (roles.rolePermissions /
// roles.roleEditPermissions, joined in by getUserByToken) — never from
// per-user overrides, so two users with the same role always have identical
// access. `user.permissions`/`user.allow_edit_*` (the old per-user columns)
// are only used as a fallback for a user whose roleId hasn't been set yet.
export const sanitizeUser = (user) => {
  if (!user) return null;
  const role = normalizeRole(user.role);
  const isAdmin = role === "Admin";

  const rolePermissions = user.rolePermissions !== undefined ? parseJsonArray(user.rolePermissions) : null;
  const roleEditPermissions = user.roleEditPermissions !== undefined ? parseJsonArray(user.roleEditPermissions) : null;

  const permissions = isAdmin
    ? ALL_PERMISSION_IDS
    : (rolePermissions !== null ? rolePermissions : parseJsonArray(user.permissions));

  const editFlags = {};
  for (const key of ALL_EDIT_KEYS) {
    editFlags[key] = isAdmin
      ? true
      : (roleEditPermissions !== null ? roleEditPermissions.includes(key) : toBit(user[key]));
  }

  return {
    id: user.userid || user.id,
    username: user.username,
    role,
    roleId: user.roleId || null,
    roleLabel: user.roleLabel || null,
    fullName: user.fullName || null,
    email: user.email || null,
    phone: user.phone || null,
    profilePhoto: user.profilePhoto || null,
    permissions,
    ...editFlags,
    notificationsEnabled: user.notificationsEnabled === undefined ? true : toBit(user.notificationsEnabled),
    allCompaniesAccess: toBit(user.allCompaniesAccess),
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
};

// A missing JWT_SECRET must fail loudly, not silently fall back to a
// hardcoded string baked into source — that fallback would let anyone forge
// a valid auth token for any user/company the moment a deploy forgets to
// set this env var, which is exactly the kind of misconfiguration that goes
// unnoticed until it's exploited.
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set — refusing to sign/verify tokens with a fallback secret.");
  return secret;
}

export const signToken = (user) =>
  jwt.sign(
    { id: user.userid || user.id, username: user.username, role: user.role, companyId: user.companyId },
    getJwtSecret(),
    { expiresIn: `${Number(process.env.SESSION_HOURS || 8)}h` }
  );

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
};

export const generateAuthToken = signToken;

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, stored) {
  if (stored && stored.startsWith("$2")) {
    const ok = await bcrypt.compare(password, stored);
    return { ok, legacy: false };
  }
  const sha256 = crypto.createHash("sha256").update(password).digest("hex");
  return { ok: sha256 === stored, legacy: true };
}

export async function recordSerialMovement(pool, movement = {}) {
  if (!pool || !movement.serialNumberGuid || !movement.serialValue || !movement.companyGuid) return;
  try {
    await pool.query(
      `INSERT INTO serialmovements
         (guid, companyGuid, serialNumberGuid, serialValue, dispatchGuid, actionType, status, itemCondition,
          reason, platform, orderid, invoiceNumber, createdAt, createdBy, notes)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movement.companyGuid,
        movement.serialNumberGuid,
        String(movement.serialValue).trim(),
        movement.dispatchGuid || null,
        safeStr(movement.actionType, "StatusUpdated"),
        safeStr(movement.status, "Unknown"),
        safeStr(movement.condition, null),
        safeStr(movement.reason, null),
        safeStr(movement.firmName, null),
        safeStr(movement.customerName, null),
        safeStr(movement.invoiceNumber, null),
        movement.createdAt ? new Date(movement.createdAt) : new Date(),
        safeStr(movement.createdBy, "System"),
        safeStr(movement.notes, null),
      ]
    );
  } catch (err) {
    console.error("Error recording serial movement:", err.message);
  }
}

export async function logUserActivity(pool, user, action, changes, ipAddress) {
  // companyGuid is NOT NULL on useractivitylogs — callers like logout/profile
  // update can run with no active company selected (e.g. Admin's "All
  // Companies" view), so skip the write instead of letting a doomed INSERT
  // fail on every such call.
  if (!user?.companyId) return;
  try {
    await pool.query(
      `INSERT INTO useractivitylogs (guid, companyGuid, userId, username, role, action, details, ipAddress)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?)`,
      [user.companyId, user.id, user.username, user.role, action, JSON.stringify(changes), ipAddress]
    );
  } catch (err) {
    console.error("Failed to create audit log:", err.message);
  }
}

export function appendErrorLog(label, err) {
  try {
    fs.appendFileSync("./error.log", `${new Date().toISOString()} [${label}]: ${err.stack || err}\n`);
  } catch (_) {}
}

const isSameDateTimeValue = (a, b) => {
  const left = safeDate(a);
  const right = safeDate(b);
  return (left ? new Date(left).getTime() : null) === (right ? new Date(right).getTime() : null);
};
const isSameStringValue = (a, b) => safeStr(a, "") === safeStr(b, "");
const isSameNumericValue = (a, b) => Number(a ?? 0) === Number(b ?? 0);

export { isSameDateTimeValue, isSameStringValue, isSameNumericValue };

export const hasDeliveredLogisticsFieldChange = (fields, current) =>
  (fields.dispatchDate !== undefined && !isSameDateTimeValue(fields.dispatchDate, current.dispatchDate)) ||
  (fields.courierPartner !== undefined && !isSameStringValue(fields.courierPartner, current.courierPartner)) ||
  (fields.logisticsDispatchDate !== undefined && !isSameDateTimeValue(fields.logisticsDispatchDate, current.logisticsDispatchDate)) ||
  (fields.trackingId !== undefined && !isSameStringValue(fields.trackingId, current.trackingId)) ||
  (fields.freightCharges !== undefined && !isSameNumericValue(fields.freightCharges, current.freightCharges)) ||
  (fields.podFilename !== undefined && !isSameStringValue(fields.podFilename, current.podFilename)) ||
  (fields.packagingCost !== undefined && !isSameNumericValue(fields.packagingCost, current.packagingCost));
