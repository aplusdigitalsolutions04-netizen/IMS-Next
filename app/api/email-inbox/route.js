import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, isSuperUser } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";
import { withErrorHandling } from "@/lib/apiResponse";
import { ensureEmailAccountsOwnerColumn } from "@/lib/emailAccountsMigration";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "emailInbox", "Only Admin can view the email inbox.");
  await ensureEmailAccountsOwnerColumn();

  const { searchParams } = new URL(request.url);
  const purpose = searchParams.get("purpose");
  let clause = purpose ? "AND m.purpose = ?" : "";
  const params = purpose ? [purpose] : [];

  // Whoever added a webmail account is the only one (besides Admin) who can
  // actually read its mail — everyone else just sees the account exists in
  // the picker (see /api/email-accounts), not its contents.
  if (!isSuperUser(normalizeRole(user.role))) {
    clause += " AND a.createdBy = ?";
    params.push(user.id);
  }

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
