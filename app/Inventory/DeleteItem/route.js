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

  // Same reasoning as DeleteItemVariant/route.js — deleting the item out
  // from under a variant that has real order history doesn't remove that
  // history, it just makes its Model/Company silently go blank everywhere
  // that joins through inventoryitemvariant/inventoryitemmaster filtered to
  // isDeleted = 0 (Global Search, Order Tracking, ORDER_SELECT).
  const [[usage]] = await mysqlPool.query(
    `SELECT COUNT(*) as cnt FROM order_items oi
     JOIN inventoryitemvariant v ON oi.itemVariantId = v.itemVariantId
     WHERE v.itemId = ? AND oi.companyGuid = ?`,
    [body.itemId, user.companyId]
  );
  if (usage.cnt > 0) {
    throw new ApiError(400, `Can't delete — variants under this item appear in ${usage.cnt} order(s)' history. Deleting it would make their Model/Company go blank everywhere. Remove/transfer those variants first if it's genuinely unused.`);
  }

  await mysqlPool.execute(
    "UPDATE inventoryitemmaster SET isDeleted = 1, deletedBy = ?, deletedAt = NOW(), deleteRemarks = ? WHERE itemId = ? AND companyGuid = ?",
    [user.username || user.fullName || "Unknown", remarks, body.itemId, user.companyId]
  );
  return NextResponse.json({ message: "Success" });
});
