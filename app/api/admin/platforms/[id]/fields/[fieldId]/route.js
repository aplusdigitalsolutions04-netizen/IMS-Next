import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermissionOrEditFlag } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requirePermissionOrEditFlag(user, "platformMaster", "allow_manage_platform_fields", "You do not have permission to manage platform fields.");
  const { fieldId } = await params;
  const { fieldName, fieldType, isRequired, sortOrder } = await parseJsonBody(request);

  const updates = [];
  const values = [];

  if (fieldName !== undefined) {
    updates.push("fieldName = ?");
    values.push(fieldName);
  }
  if (fieldType !== undefined) {
    updates.push("fieldType = ?");
    values.push(fieldType);
  }
  if (isRequired !== undefined) {
    updates.push("isRequired = ?");
    values.push(isRequired ? 1 : 0);
  }
  if (sortOrder !== undefined) {
    updates.push("sortOrder = ?");
    values.push(sortOrder);
  }

  if (updates.length > 0) {
    await mysqlPool.query(
      `UPDATE selling_platform_fields SET ${updates.join(", ")} WHERE guid = ?`,
      [...values, fieldId]
    );
  }

  return NextResponse.json({ message: "Field updated successfully" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requirePermissionOrEditFlag(user, "platformMaster", "allow_manage_platform_fields", "You do not have permission to manage platform fields.");
  const { fieldId } = await params;

  await mysqlPool.query("DELETE FROM selling_platform_fields WHERE guid = ?", [fieldId]);

  return NextResponse.json({ message: "Field deleted successfully" });
});
