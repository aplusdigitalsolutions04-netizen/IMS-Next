import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireRoles } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireRoles(user, ["Admin"], "Only Admin can view the email inbox.");

  const { searchParams } = new URL(request.url);
  const purpose = searchParams.get("purpose");
  const clause = purpose ? "AND m.purpose = ?" : "";
  const params = purpose ? [purpose] : [];

  const [rows] = await mysqlPool.query(
    `SELECT m.*, a.accountName, c.name as companyName
     FROM email_messages m
     LEFT JOIN email_accounts a ON m.emailAccountGuid = a.guid
     LEFT JOIN companies c ON m.companyGuid = c.guid
     WHERE 1=1 ${clause}
     ORDER BY m.receivedAt DESC
     LIMIT 200`,
    params
  );
  return NextResponse.json({ data: rows });
});
