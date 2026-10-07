import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, ApiError } from "@/lib/auth";
import { logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureCredentialsTables } from "@/lib/credentialsMigration";
import { encryptSecret } from "@/lib/credentialsCrypto";
import { requireManage, buildStoredCustomFields, archiveCurrentPassword, companyCondition } from "@/lib/credentialsHelpers";

async function loadCredential(id, user) {
  const scope = companyCondition(user);
  const [[row]] = await mysqlPool.query(
    `SELECT * FROM credentials WHERE guid = ? AND isDeleted = 0 AND ${scope.sql}`,
    [id, ...scope.params]
  );
  if (!row) throw new ApiError(404, "Credential not found.");
  return row;
}

// A blank password on edit means "leave the password as it is" — the edit form
// never receives the current one. A non-blank value replaces it, and the old
// one goes into history (who/when is recorded on the row and in the audit log;
// the password itself is never written to the audit log).
export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "credentials", "You do not have permission to access credentials.");
  requireManage(user);
  await ensureCredentialsTables();
  const { id } = await params;
  const current = await loadCredential(id, user);
  const body = await parseJsonBody(request);

  const title = String(body.title ?? current.title).trim();
  if (!title) throw new ApiError(400, "Title is required.");

  const changingPassword = body.password !== undefined && body.password !== null && body.password !== "";
  let passwordEnc = current.passwordEnc;
  let passwordChangedAt = current.passwordChangedAt;
  let passwordChangedBy = current.passwordChangedBy;
  if (changingPassword) {
    await archiveCurrentPassword(current, user.id);
    passwordEnc = encryptSecret(body.password);
    passwordChangedAt = new Date();
    passwordChangedBy = user.id;
  }

  await mysqlPool.query(
    `UPDATE credentials SET title = ?, username = ?, passwordEnc = ?, url = ?, category = ?, notes = ?, customFields = ?,
       updatedBy = ?, passwordChangedAt = ?, passwordChangedBy = ? WHERE guid = ?`,
    [
      title,
      body.username !== undefined ? (body.username?.trim() || null) : current.username,
      passwordEnc,
      body.url !== undefined ? (body.url?.trim() || null) : current.url,
      body.category !== undefined ? (body.category || null) : current.category,
      body.notes !== undefined ? (body.notes || null) : current.notes,
      body.customFields !== undefined ? JSON.stringify(buildStoredCustomFields(body.customFields, current.customFields)) : (typeof current.customFields === "string" ? current.customFields : JSON.stringify(current.customFields || [])),
      user.id, passwordChangedAt, passwordChangedBy, id,
    ]
  );

  const ip = request.headers.get("x-forwarded-for") || null;
  await logUserActivity(mysqlPool, user, changingPassword ? "CREDENTIAL_PASSWORD_CHANGED" : "CREDENTIAL_UPDATED", { credentialGuid: id, title }, ip);
  return NextResponse.json({ message: "Credential updated", passwordChanged: changingPassword });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "credentials", "You do not have permission to access credentials.");
  requireManage(user);
  await ensureCredentialsTables();
  const { id } = await params;
  const current = await loadCredential(id, user);

  // Soft delete: the row (and its encrypted history) stays recoverable from
  // the database if it was removed by mistake.
  await mysqlPool.query("UPDATE credentials SET isDeleted = 1, updatedBy = ? WHERE guid = ?", [user.id, id]);
  await logUserActivity(mysqlPool, user, "CREDENTIAL_DELETED", { credentialGuid: id, title: current.title }, request.headers.get("x-forwarded-for") || null);
  return NextResponse.json({ message: "Credential deleted" });
});
