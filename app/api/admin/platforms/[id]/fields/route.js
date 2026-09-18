import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requirePermissionOrEditFlag, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensurePlatformFieldOptionsColumn } from "@/lib/platformsMigration";
import { parseJsonArray } from "@/lib/helpers";

// Get fields for a specific platform
export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  await ensurePlatformFieldOptionsColumn();
  const { id: platformGuid } = await params;

  const [rows] = await mysqlPool.query(
    "SELECT guid, platformGuid, fieldName, fieldType, fieldOptions, isRequired, sortOrder FROM selling_platform_fields WHERE platformGuid = ? ORDER BY sortOrder ASC",
    [platformGuid]
  );

  return NextResponse.json({ data: rows.map((r) => ({ ...r, fieldOptions: r.fieldOptions ? parseJsonArray(r.fieldOptions) : [] })) });
});

// Add a new field
export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requirePermissionOrEditFlag(user, "platformMaster", "allow_manage_platform_fields", "You do not have permission to manage platform fields.");
  await ensurePlatformFieldOptionsColumn();
  const { id: platformGuid } = await params;
  const { fieldName, fieldType = "text", fieldOptions, isRequired = false, sortOrder = 0 } = await parseJsonBody(request);

  if (!fieldName?.trim()) throw new ApiError(400, "Field name is required.");
  const cleanedOptions = Array.isArray(fieldOptions) ? fieldOptions.map((o) => String(o).trim()).filter(Boolean) : [];
  if (fieldType === "dropdown" && cleanedOptions.length === 0) {
    throw new ApiError(400, "A dropdown field needs at least one option.");
  }

  const guid = randomUUID();
  await mysqlPool.query(
    "INSERT INTO selling_platform_fields (guid, platformGuid, fieldName, fieldType, fieldOptions, isRequired, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [guid, platformGuid, fieldName.trim(), fieldType, fieldType === "dropdown" ? JSON.stringify(cleanedOptions) : null, isRequired ? 1 : 0, sortOrder]
  );

  return NextResponse.json({ message: "Field added successfully", guid });
});
