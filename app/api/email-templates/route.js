import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, authorizeMasterWrite, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureEmailTemplatesAccountColumn } from "@/lib/emailAccountsMigration";

async function validatePurpose(purpose) {
  const [[row]] = await mysqlPool.query("SELECT purposeKey FROM email_purposes WHERE purposeKey = ? AND isActive = 1", [purpose]);
  if (!row) throw new ApiError(400, `"${purpose}" is not a valid, active purpose — add it under Email Accounts > Manage Purposes first.`);
}

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "emailTemplates", "Only Admin can view email templates.");
  await ensureEmailTemplatesAccountColumn();

  const [rows] = await mysqlPool.query(`
    SELECT e.*, c.name as companyName, a.accountName as emailAccountName
    FROM email_templates e
    LEFT JOIN companies c ON e.companyGuid = c.guid
    LEFT JOIN email_accounts a ON e.emailAccountGuid = a.guid
    ORDER BY e.purpose ASC, c.name ASC
  `);
  return NextResponse.json({ data: rows });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterWrite(user, "emailTemplates", { isCreate: true, denyMessage: "You do not have permission to add email templates." });
  await ensureEmailTemplatesAccountColumn();

  const body = await parseJsonBody(request);
  const { companyGuid, purpose, templateName, emailSubject, emailBody, isActive, emailCc, emailBcc, emailAccountGuid } = body;

  await validatePurpose(purpose);
  if (!templateName?.trim()) throw new ApiError(400, "Template name is required");
  if (!emailSubject?.trim()) throw new ApiError(400, "Email subject is required");
  if (!emailBody?.trim()) throw new ApiError(400, "Email body is required");
  if (!emailAccountGuid) throw new ApiError(400, "An email account is required — pick which webmail this template sends from.");

  const guid = randomUUID();
  await mysqlPool.query(
    `INSERT INTO email_templates (guid, companyGuid, purpose, templateName, emailSubject, emailBody, isActive, emailCc, emailBcc, emailAccountGuid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [guid, companyGuid || null, purpose, templateName.trim(), emailSubject.trim(), emailBody, isActive === false ? 0 : 1, emailCc?.trim() || null, emailBcc?.trim() || null, emailAccountGuid || null]
  );

  return NextResponse.json({ message: "Template created", guid });
});
