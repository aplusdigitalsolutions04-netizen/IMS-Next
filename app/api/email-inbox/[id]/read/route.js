import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requirePermission(user, "emailInbox", "Only Admin can update the email inbox.");
  const { id } = await params;
  const { isRead } = await parseJsonBody(request);

  const [result] = await mysqlPool.query("UPDATE email_messages SET isRead = ? WHERE guid = ?", [isRead === false ? 0 : 1, id]);
  if (result.affectedRows === 0) throw new ApiError(404, "Message not found");

  return NextResponse.json({ message: "Updated" });
});
