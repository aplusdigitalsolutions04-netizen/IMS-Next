import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

async function validatePurpose(purpose) {
  const [[row]] = await mysqlPool.query("SELECT purposeKey FROM email_purposes WHERE purposeKey = ? AND isActive = 1", [purpose]);
  if (!row) throw new ApiError(400, `"${purpose}" is not a valid, active purpose — add it under Email Accounts > Manage Purposes first.`);
}

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "emailTemplates", "Only Admin can manage email templates.");
  const { id } = await params;

  const body = await parseJsonBody(request);
  const { companyGuid, purpose, templateName, emailSubject, emailBody, isActive, emailCc, emailBcc } = body;

  await validatePurpose(purpose);
  if (!templateName?.trim()) throw new ApiError(400, "Template name is required");
  if (!emailSubject?.trim()) throw new ApiError(400, "Email subject is required");
  if (!emailBody?.trim()) throw new ApiError(400, "Email body is required");

  const [result] = await mysqlPool.query(
    `UPDATE email_templates SET companyGuid = ?, purpose = ?, templateName = ?, emailSubject = ?, emailBody = ?, isActive = ?, emailCc = ?, emailBcc = ?
     WHERE guid = ?`,
    [companyGuid || null, purpose, templateName.trim(), emailSubject.trim(), emailBody, isActive === false ? 0 : 1, emailCc?.trim() || null, emailBcc?.trim() || null, id]
  );
  if (result.affectedRows === 0) throw new ApiError(404, "Template not found");

  return NextResponse.json({ message: "Template updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "emailTemplates", "Only Admin can manage email templates.");
  const { id } = await params;

  const [result] = await mysqlPool.query("DELETE FROM email_templates WHERE guid = ?", [id]);
  if (result.affectedRows === 0) throw new ApiError(404, "Template not found");

  return NextResponse.json({ message: "Template deleted" });
});
