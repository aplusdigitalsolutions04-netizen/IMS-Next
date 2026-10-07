import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";
import { runTaskReminders } from "@/lib/taskReminders";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  await runTaskReminders(user);

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit")) || 50;
  const offset = parseInt(searchParams.get("offset")) || 0;

  const [rows] = await mysqlPool.query(
    "SELECT * FROM notifications WHERE targetUserGuid = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?",
    [user.id, limit, offset]
  );

  const [unreadCountRow] = await mysqlPool.query(
    "SELECT COUNT(*) as unread FROM notifications WHERE targetUserGuid = ? AND isRead = FALSE",
    [user.id]
  );

  return NextResponse.json({ notifications: rows, unreadCount: unreadCountRow[0].unread });
});
