import { mysqlPool } from "@/lib/db";
import { ALL_PERMISSION_IDS, ALL_EDIT_KEYS, parseJsonArray } from "@/lib/helpers";

// Per-user access overrides on top of the user's role ("user based" access
// alongside the existing "role based" one):
//   final access = role's access + this user's EXTRA − this user's BLOCKED.
// Stored as four JSON arrays on `users`; resolved in helpers.js sanitizeUser().
let ensured = false;
export async function ensureUserAccessColumns() {
  if (ensured) return;
  for (const col of ["extraPermissions", "blockedPermissions", "extraEditPermissions", "blockedEditPermissions"]) {
    try {
      await mysqlPool.query(`ALTER TABLE users ADD COLUMN ${col} JSON NULL`);
    } catch (err) {
      if (err.code !== "ER_DUP_FIELDNAME") throw err;
    }
  }
  ensured = true;
}

const clean = (value, allowed) => [...new Set(parseJsonArray(value).map(String))].filter((x) => allowed.includes(x));

// Whitelists every id, and makes sure nothing is both "extra" and "blocked".
export function cleanAccessOverrides(input) {
  const o = input && typeof input === "object" ? input : {};
  const blocked = clean(o.blocked, ALL_PERMISSION_IDS);
  const blockedEdit = clean(o.blockedEdit, ALL_EDIT_KEYS);
  return {
    extra: clean(o.extra, ALL_PERMISSION_IDS).filter((x) => !blocked.includes(x)),
    blocked,
    extraEdit: clean(o.extraEdit, ALL_EDIT_KEYS).filter((x) => !blockedEdit.includes(x)),
    blockedEdit,
  };
}

export async function saveAccessOverrides(userId, input) {
  await ensureUserAccessColumns();
  const o = cleanAccessOverrides(input);
  await mysqlPool.query(
    "UPDATE users SET extraPermissions = ?, blockedPermissions = ?, extraEditPermissions = ?, blockedEditPermissions = ? WHERE userid = ?",
    [JSON.stringify(o.extra), JSON.stringify(o.blocked), JSON.stringify(o.extraEdit), JSON.stringify(o.blockedEdit), userId]
  );
}
