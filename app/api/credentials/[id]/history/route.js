import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requirePermission, ApiError } from "@/lib/auth";
import { logUserActivity } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureCredentialsTables } from "@/lib/credentialsMigration";
import { requireManage, requireViewPasswords, archiveCurrentPassword, companyCondition } from "@/lib/credentialsHelpers";

async function loadCredential(id, user) {
  const scope = companyCondition(user);
  const [[row]] = await mysqlPool.query(
    `SELECT * FROM credentials WHERE guid = ? AND isDeleted = 0 AND ${scope.sql}`,
    [id, ...scope.params]
  );
  if (!row) throw new ApiError(404, "Credential not found.");
  return row;
}

// Who changed the password and when — metadata only (no passwords). Visible to
// anyone who can open the Credentials tab; reading an old password itself goes
// through the reveal endpoint and needs "View Credential Passwords".
export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "credentials", "You do not have permission to access credentials.");
  await ensureCredentialsTables();
  const { id } = await params;
  await loadCredential(id, user);

  const [rows] = await mysqlPool.query(
    `SELECT h.guid, h.changedAt, u.username AS changedByName
     FROM credential_password_history h LEFT JOIN users u ON u.userid = h.changedBy
     WHERE h.credentialGuid = ? ORDER BY h.changedAt DESC, h.guid DESC`,
    [id]
  );
  return NextResponse.json({ data: rows });
});

// Restore: make an old password current again (the current one is archived
// first, so nothing is lost).
export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requirePermission(user, "credentials", "You do not have permission to access credentials.");
  requireManage(user);
  requireViewPasswords(user);
  await ensureCredentialsTables();
  const { id } = await params;
  const current = await loadCredential(id, user);

  const { historyGuid } = await parseJsonBody(request);
  const [[h]] = await mysqlPool.query(
    "SELECT guid, passwordEnc FROM credential_password_history WHERE guid = ? AND credentialGuid = ?",
    [historyGuid, id]
  );
  if (!h) throw new ApiError(404, "History entry not found.");

  await archiveCurrentPassword(current, user.id);
  await mysqlPool.query(
    "UPDATE credentials SET passwordEnc = ?, passwordChangedAt = NOW(), passwordChangedBy = ?, updatedBy = ? WHERE guid = ?",
    [h.passwordEnc, user.id, user.id, id]
  );
  await logUserActivity(mysqlPool, user, "CREDENTIAL_PASSWORD_RESTORED", { credentialGuid: id, title: current.title }, request.headers.get("x-forwarded-for") || null);
  return NextResponse.json({ message: "Password restored" });
});
