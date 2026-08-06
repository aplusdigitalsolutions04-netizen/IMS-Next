import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

// Read-only for any authenticated user — every order/dispatch/company form
// that shows a "Platform" dropdown needs this list, not just Admins. Only
// active platforms are returned; management (add/rename/deactivate) is
// Admin-only via /api/admin/platforms.
export const GET = withErrorHandling(async (request) => {
  await authenticateRequest(request);

  const [rows] = await mysqlPool.query(
    "SELECT guid, name, colorTheme FROM selling_platforms WHERE isActive = 1 ORDER BY sortOrder ASC, name ASC"
  );
  return NextResponse.json({ data: rows });
});
