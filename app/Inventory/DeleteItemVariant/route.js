import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, authorizeMasterDelete, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureDeletedByColumns } from "@/lib/deletedItemsMigration";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  // Its own delete-flag (allow_delete_variant), not "item" — deleting a
  // variant is a much smaller, more common action than deleting the whole
  // Item Master entry, so it's delegable independently via Manage Roles.
  authorizeMasterDelete(user, "variant");
  requireAuth(user);
  await ensureDeletedByColumns();

  const { itemVariantId } = body;
  const remarks = String(body.remarks || "").trim();
  if (!remarks) throw new ApiError(400, "A remark is required to delete.");

  await mysqlPool.execute(
    "UPDATE inventoryitemvariant SET isDeleted = 1, deletedBy = ?, deletedAt = NOW(), deleteRemarks = ? WHERE itemVariantId = ? AND companyGuid = ?",
    [user.username || user.fullName || "Unknown", remarks, itemVariantId, user.companyId]
  );
  return NextResponse.json({ message: "Success" });
});
