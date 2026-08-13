import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, requireCompany } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

// This is the per-company user-activity audit trail (logins, record edits,
// etc. — see logUserActivity in lib/helpers.js), a different table from the
// raw API request log in app/api/admin/api-logs/route.js. Was hardcoded
// Admin-only; now gated by the "userActivity" permission like every other
// tab, so a role can be granted this without full Admin.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "userActivity", "You do not have permission to view activity logs.");

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(200, Number(searchParams.get("limit")) || 10);
  const offset = (page - 1) * limit;

  const [[{ total }]] = await mysqlPool.query(
    "SELECT COUNT(*) as total FROM useractivitylogs WHERE companyGuid=?",
    [user.companyId]
  );
  const [rows] = await mysqlPool.query(
    `SELECT guid as id, username, role, action, details, ipAddress, changedAt
     FROM useractivitylogs WHERE companyGuid=? ORDER BY changedAt DESC LIMIT ? OFFSET ?`,
    [user.companyId, limit, offset]
  );

  return NextResponse.json({ data: rows, total, page, limit });
});
