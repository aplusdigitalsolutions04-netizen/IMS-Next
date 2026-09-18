import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, authorizeMasterDelete, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureDeletedByColumns } from "@/lib/deletedItemsMigration";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeMasterDelete(user, "item");
  requireAuth(user);
  await ensureDeletedByColumns();

  const remarks = String(body.remarks || "").trim();
  if (!remarks) throw new ApiError(400, "A remark is required to delete.");

  await mysqlPool.execute(
    "UPDATE inventoryitemmaster SET isDeleted = 1, deletedBy = ?, deletedAt = NOW(), deleteRemarks = ? WHERE itemId = ? AND companyGuid = ?",
    [user.username || user.fullName || "Unknown", remarks, body.itemId, user.companyId]
  );
  return NextResponse.json({ message: "Success" });
});
