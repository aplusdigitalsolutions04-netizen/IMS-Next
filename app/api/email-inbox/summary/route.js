import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, isSuperUser } from "@/lib/auth";
import { normalizeRole } from "@/lib/helpers";
import { withErrorHandling } from "@/lib/apiResponse";
import { ensureEmailAccountsOwnerColumn, ensureEmailAccountsSharedColumn } from "@/lib/emailAccountsMigration";

// Dashboard Mail card: counts + the latest few messages. Same visibility rule
// as the inbox list itself — non-Admin users only see accounts they added or
// that were shared with them.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "emailInbox", "Only Admin can view the email inbox.");
  await ensureEmailAccountsOwnerColumn();
  await ensureEmailAccountsSharedColumn();

  let clause = "";
  const params = [];
  if (!isSuperUser(normalizeRole(user.role))) {
    clause = " AND (a.createdBy = ? OR JSON_CONTAINS(a.sharedWith, JSON_QUOTE(?)))";
    params.push(user.id, String(user.id));
  }

  const [[counts]] = await mysqlPool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(m.isRead = 0), 0) AS unread,
            COALESCE(SUM(m.receivedAt >= CURDATE()), 0) AS today
       FROM email_messages m
       LEFT JOIN email_accounts a ON m.emailAccountGuid = a.guid
      WHERE 1=1 ${clause}`,
    params
  );

  const [latest] = await mysqlPool.query(
    `SELECT m.guid, m.fromName, m.fromAddress, m.subject, m.receivedAt, m.isRead
       FROM email_messages m
       LEFT JOIN email_accounts a ON m.emailAccountGuid = a.guid
      WHERE 1=1 ${clause}
      ORDER BY m.receivedAt DESC LIMIT 5`,
    params
  );

  return NextResponse.json({
    total: Number(counts.total), unread: Number(counts.unread), today: Number(counts.today), latest,
  });
});
