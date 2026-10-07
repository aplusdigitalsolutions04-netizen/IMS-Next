import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { isSuperUser, hasAllCompaniesAccess, ApiError } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";
import { encryptSecret } from "@/lib/credentialsCrypto";
import { MAX_PASSWORD_HISTORY } from "@/lib/credentialsMigration";

// Puts the CURRENT password into history and trims history to the latest
// MAX_PASSWORD_HISTORY entries. Called whenever the password is replaced.
export async function archiveCurrentPassword(credential, changedBy) {
  if (!credential.passwordEnc) return;
  await mysqlPool.query(
    "INSERT INTO credential_password_history (guid, credentialGuid, passwordEnc, changedBy) VALUES (?, ?, ?, ?)",
    [randomUUID(), credential.guid, credential.passwordEnc, changedBy]
  );
  await mysqlPool.query(
    `DELETE FROM credential_password_history WHERE credentialGuid = ? AND guid NOT IN (
       SELECT guid FROM (SELECT guid FROM credential_password_history WHERE credentialGuid = ? ORDER BY changedAt DESC, guid DESC LIMIT ?) keep
     )`,
    [credential.guid, credential.guid, MAX_PASSWORD_HISTORY]
  );
}

export const canManageCredentials = (user) => isSuperUser(normalizeRole(user.role)) || !!user.allow_manage_credentials;
export const canViewCredentialPasswords = (user) => isSuperUser(normalizeRole(user.role)) || !!user.allow_view_credential_passwords;

// Looking up ONE credential by guid: a normal user only ever reaches their
// active company's credentials; Admin / all-companies-access users can reach
// any company's (that's what the "All Companies" view on the page needs —
// reveal, edit, history, delete must work on those rows too).
export function companyCondition(user) {
  return hasAllCompaniesAccess(user)
    ? { sql: "1 = 1", params: [] }
    : { sql: "companyGuid <=> ?", params: [user.companyId] };
}

export function requireManage(user) {
  if (!canManageCredentials(user)) throw new ApiError(403, "You do not have permission to add or edit credentials.");
}
export function requireViewPasswords(user) {
  if (!canViewCredentialPasswords(user)) throw new ApiError(403, "You do not have permission to view credential passwords.");
}

const parseJson = (v) => {
  if (Array.isArray(v)) return v;
  try { const p = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(p) ? p : []; } catch { return []; }
};

// What the list/detail API returns: never a password, and never the value of
// a custom field marked secret — only whether one is set. Non-secret custom
// field values (e.g. a Customer ID) are shown as plain text.
export function toPublicCredential(row) {
  const customFields = parseJson(row.customFields).map((f) => ({
    id: f.id,
    label: f.label,
    secret: !!f.secret,
    value: f.secret ? null : (f.value ?? ""),
    hasValue: !!f.value,
  }));
  return {
    guid: row.guid,
    companyGuid: row.companyGuid,
    companyName: row.companyName || null,
    title: row.title,
    username: row.username,
    url: row.url,
    category: row.category,
    notes: row.notes,
    hasPassword: !!row.passwordEnc,
    customFields,
    createdByName: row.createdByName || null,
    passwordChangedAt: row.passwordChangedAt,
    passwordChangedByName: row.passwordChangedByName || null,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

// Builds the stored customFields JSON from the form's list. A secret field is
// encrypted; a blank value on an EXISTING secret field means "leave it as it
// is" (the edit form never receives the current secret), matched by field id.
export function buildStoredCustomFields(input, existingStored = []) {
  const existingById = new Map(parseJson(existingStored).map((f) => [f.id, f]));
  const out = [];
  for (const f of Array.isArray(input) ? input : []) {
    const label = String(f?.label || "").trim();
    if (!label) continue;
    const secret = !!f.secret;
    const id = f.id && existingById.has(f.id) ? f.id : randomUUID();
    const previous = existingById.get(id);
    const raw = f.value === undefined || f.value === null ? "" : String(f.value);
    let value;
    if (secret) {
      if (raw !== "") value = encryptSecret(raw);
      else value = previous?.secret ? previous.value : null; // keep existing encrypted value
    } else {
      value = raw;
    }
    out.push({ id, label, secret, value });
  }
  return out;
}
