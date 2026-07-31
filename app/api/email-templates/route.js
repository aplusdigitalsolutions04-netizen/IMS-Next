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
  requireRoles(user, ["Admin"], "Only Admin can view email templates.");

  const [rows] = await mysqlPool.query(`
    SELECT e.*, c.name as companyName
    FROM email_templates e
    LEFT JOIN companies c ON e.companyGuid = c.guid
    ORDER BY e.purpose ASC, c.name ASC
  `);
  return NextResponse.json({ data: rows });
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can manage email templates.");

  const body = await parseJsonBody(request);
  const { companyGuid, purpose, templateName, emailSubject, emailBody, isActive } = body;

  await validatePurpose(purpose);
  if (!templateName?.trim()) throw new ApiError(400, "Template name is required");
  if (!emailSubject?.trim()) throw new ApiError(400, "Email subject is required");
  if (!emailBody?.trim()) throw new ApiError(400, "Email body is required");

  const guid = randomUUID();
  await mysqlPool.query(
    `INSERT INTO email_templates (guid, companyGuid, purpose, templateName, emailSubject, emailBody, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [guid, companyGuid || null, purpose, templateName.trim(), emailSubject.trim(), emailBody, isActive === false ? 0 : 1]
  );

  return NextResponse.json({ message: "Template created", guid });
});
