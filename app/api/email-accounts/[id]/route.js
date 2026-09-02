import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeMasterWrite, authorizeMasterDelete, isSuperUser, ApiError } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureEmailAccountsSignatureColumn } from "@/lib/emailAccountsMigration";

async function validatePurpose(purpose) {
  const [[row]] = await mysqlPool.query("SELECT purposeKey FROM email_purposes WHERE purposeKey = ? AND isActive = 1", [purpose]);
  if (!row) throw new ApiError(400, `"${purpose}" is not a valid, active purpose — add it under Email Accounts > Manage Purposes first.`);
}

// Not just hidden from the list — someone who isn't Admin and didn't add
// this account can't reach it directly via the API either.
async function assertOwnerOrAdmin(user, id) {
  if (isSuperUser(normalizeRole(user.role))) return;
  const [[row]] = await mysqlPool.query("SELECT createdBy FROM email_accounts WHERE guid = ?", [id]);
  if (!row) throw new ApiError(404, "Email account not found");
  if (row.createdBy !== user.id) throw new ApiError(403, "Only the person who added this account (or Admin) can manage it.");
}

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "emailAccounts", { isCreate: false, denyMessage: "You do not have permission to edit email accounts." });
  await ensureEmailAccountsSignatureColumn();
  const { id } = await params;
  await assertOwnerOrAdmin(user, id);

  const body = await parseJsonBody(request);
  const {
    companyGuid, purpose, accountName, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromName, fromEmail, isActive,
    imapEnabled, imapHost, imapPort, imapSecure, signature,
  } = body;

  await validatePurpose(purpose);
  if (!accountName?.trim()) throw new ApiError(400, "Account name is required");
  if (!smtpHost?.trim()) throw new ApiError(400, "SMTP host is required");
  if (!smtpUser?.trim()) throw new ApiError(400, "SMTP user is required");
  if (!fromEmail?.trim()) throw new ApiError(400, "From email is required");
  if (imapEnabled && !imapHost?.trim()) throw new ApiError(400, "IMAP host is required to enable inbox reading");

  // Password is optional on update — blank means "keep the existing one".
  const setPassClause = smtpPass?.trim() ? ", smtpPass = ?" : "";
  const params2 = [
    companyGuid || null, purpose, accountName.trim(), smtpHost.trim(),
    Number(smtpPort) || 587, smtpSecure ? 1 : 0, smtpUser.trim(),
    fromName?.trim() || null, fromEmail.trim(), isActive === false ? 0 : 1,
    imapEnabled ? 1 : 0, imapHost?.trim() || null, Number(imapPort) || 993, imapSecure === false ? 0 : 1,
    signature || null,
  ];
  if (smtpPass?.trim()) params2.push(smtpPass.trim());
  params2.push(id);

  const [result] = await mysqlPool.query(
    `UPDATE email_accounts SET
       companyGuid = ?, purpose = ?, accountName = ?, smtpHost = ?, smtpPort = ?,
       smtpSecure = ?, smtpUser = ?, fromName = ?, fromEmail = ?, isActive = ?,
       imapEnabled = ?, imapHost = ?, imapPort = ?, imapSecure = ?, signature = ?
       ${setPassClause}
     WHERE guid = ?`,
    params2
  );
  if (result.affectedRows === 0) throw new ApiError(404, "Email account not found");

  return NextResponse.json({ message: "Email account updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeMasterDelete(user, "emailAccounts", "You do not have permission to delete email accounts.");
  const { id } = await params;
  await assertOwnerOrAdmin(user, id);

  const [result] = await mysqlPool.query("DELETE FROM email_accounts WHERE guid = ?", [id]);
  if (result.affectedRows === 0) throw new ApiError(404, "Email account not found");

  return NextResponse.json({ message: "Email account deleted" });
});
