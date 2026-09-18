import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { ensurePlatformItemTypeColumn, ensurePlatformFieldOptionsColumn } from "@/lib/platformsMigration";
import { parseJsonArray } from "@/lib/helpers";

// Read-only for any authenticated user — every order/dispatch/company form
// that shows a "Platform" dropdown needs this list, not just Admins. Only
// active platforms are returned; management (add/rename/deactivate) is
// Admin-only via /api/admin/platforms.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  await ensurePlatformItemTypeColumn();
  await ensurePlatformFieldOptionsColumn();

  const [rows] = await mysqlPool.query(
    "SELECT guid, name, colorTheme, itemTypeMode FROM selling_platforms WHERE isActive = 1 ORDER BY sortOrder ASC, name ASC"
  );

  const [fieldRows] = await mysqlPool.query(
    "SELECT guid, platformGuid, fieldName, fieldType, fieldOptions, isRequired, sortOrder FROM selling_platform_fields ORDER BY sortOrder ASC"
  );
  
  const fieldsByPlatform = {};
  for (const field of fieldRows) {
    if (!fieldsByPlatform[field.platformGuid]) fieldsByPlatform[field.platformGuid] = [];
    fieldsByPlatform[field.platformGuid].push({ ...field, fieldOptions: field.fieldOptions ? parseJsonArray(field.fieldOptions) : [] });
  }
  
  const data = rows.map(row => ({
    ...row,
    fields: fieldsByPlatform[row.guid] || []
  }));

  return NextResponse.json({ data });
});
