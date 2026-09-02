import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "emailAccounts", "You do not have permission to manage email purposes.");
  const { id } = await params;

  const { label, isActive } = await parseJsonBody(request);
  const [[existing]] = await mysqlPool.query("SELECT * FROM email_purposes WHERE guid = ?", [id]);
  if (!existing) throw new ApiError(404, "Purpose not found");
  if (existing.isSystem && isActive === false) throw new ApiError(400, `"${existing.label}" is a system purpose and can't be deactivated.`);
  if (!label?.trim()) throw new ApiError(400, "Label is required");

  await mysqlPool.query("UPDATE email_purposes SET label = ?, isActive = ? WHERE guid = ?", [
    label.trim(), isActive === false ? 0 : 1, id,
  ]);
  return NextResponse.json({ message: "Purpose updated" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "emailAccounts", "You do not have permission to manage email purposes.");
  const { id } = await params;

  const [[existing]] = await mysqlPool.query("SELECT * FROM email_purposes WHERE guid = ?", [id]);
  if (!existing) throw new ApiError(404, "Purpose not found");
  if (existing.isSystem) throw new ApiError(400, `"${existing.label}" is a system purpose and can't be deleted.`);

  const [inUse] = await mysqlPool.query("SELECT guid FROM email_accounts WHERE purpose = ? LIMIT 1", [existing.purposeKey]);
  if (inUse.length > 0) throw new ApiError(400, `"${existing.label}" is used by an existing email account — remove or reassign that account first.`);

  await mysqlPool.query("DELETE FROM email_purposes WHERE guid = ?", [id]);
  return NextResponse.json({ message: "Purpose deleted" });
});
