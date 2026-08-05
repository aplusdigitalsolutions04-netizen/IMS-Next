import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireRoles } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

// Full rows (with label/description/updatedBy) for the admin settings page
// — the plain-value map at GET /api/settings is what the rest of the app
// actually consumes.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can view business settings.");

  const [rows] = await mysqlPool.query("SELECT * FROM app_settings ORDER BY label");
  return NextResponse.json({ data: rows });
});
