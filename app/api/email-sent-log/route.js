import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireRoles } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can view sent emails.");

  const [rows] = await mysqlPool.query(`
    SELECT s.*, c.name as companyName
    FROM email_sent_log s
    LEFT JOIN companies c ON s.companyGuid = c.guid
    ORDER BY s.sentAt DESC
    LIMIT 500
  `);
  return NextResponse.json({ data: rows });
});
