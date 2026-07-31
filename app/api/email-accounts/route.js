import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireRoles, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

async function validatePurpose(purpose) {
  const [[row]] = await mysqlPool.query("SELECT purposeKey FROM email_purposes WHERE purposeKey = ? AND isActive = 1", [purpose]);
  if (!row) throw new ApiError(400, `"${purpose}" is not a valid, active purpose — add it under Email Accounts > Manage Purposes first.`);
}

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can view email accounts.");

  const [rows] = await mysqlPool.query(`
    SELECT e.*, c.name as companyName
    FROM email_accounts e
    LEFT JOIN companies c ON e.companyGuid = c.guid
    ORDER BY e.purpose ASC, c.name ASC
  `);
  // Never send the SMTP password back to the client.
  const sanitized = rows.map(({ smtpPass, ...rest }) => rest);
  return NextResponse.json({ data: sanitized });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can manage email accounts.");

  const body = await parseJsonBody(request);
  const {
    companyGuid, purpose, accountName, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromName, fromEmail, isActive,
    imapEnabled, imapHost, imapPort, imapSecure,
  } = body;

  await validatePurpose(purpose);
  if (!accountName?.trim()) throw new ApiError(400, "Account name is required");
  if (!smtpHost?.trim()) throw new ApiError(400, "SMTP host is required");
  if (!smtpUser?.trim()) throw new ApiError(400, "SMTP user is required");
  if (!smtpPass?.trim()) throw new ApiError(400, "SMTP password is required");
  if (!fromEmail?.trim()) throw new ApiError(400, "From email is required");
  if (imapEnabled && !imapHost?.trim()) throw new ApiError(400, "IMAP host is required to enable inbox reading");

  const guid = randomUUID();
  await mysqlPool.query(
    `INSERT INTO email_accounts
       (guid, companyGuid, purpose, accountName, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromName, fromEmail, isActive,
        imapEnabled, imapHost, imapPort, imapSecure)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      guid, companyGuid || null, purpose, accountName.trim(), smtpHost.trim(),
      Number(smtpPort) || 587, smtpSecure ? 1 : 0, smtpUser.trim(), smtpPass,
      fromName?.trim() || null, fromEmail.trim(), isActive === false ? 0 : 1,
      imapEnabled ? 1 : 0, imapHost?.trim() || null, Number(imapPort) || 993, imapSecure === false ? 0 : 1,
    ]
  );

  return NextResponse.json({ message: "Email account created", guid });
});
