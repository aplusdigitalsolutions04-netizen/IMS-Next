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

  // A variant left behind under a deleted item becomes just as orphaned as
  // one with order history (its own Model/Company resolution breaks the
  // same way) — the difference is this one has no order history to warn
  // about yet, so it'd fail completely silently instead. Deleting the item
  // never cascades to its variants (Item Master's own Delete only removes
  // variants one at a time via DeleteItemVariant), so any that are still
  // here need to be moved (Transfer Variant) or deleted first.
  const [[remaining]] = await mysqlPool.query(
    "SELECT COUNT(*) as cnt FROM inventoryitemvariant WHERE itemId = ? AND companyGuid = ? AND isDeleted = 0",
    [body.itemId, user.companyId]
  );
  if (remaining.cnt > 0) {
    throw new ApiError(400, `Can't delete — this item still has ${remaining.cnt} variant(s) under it. Transfer or delete them first.`);
  }

  await mysqlPool.execute(
    "UPDATE inventoryitemmaster SET isDeleted = 1, deletedBy = ?, deletedAt = NOW(), deleteRemarks = ? WHERE itemId = ? AND companyGuid = ?",
    [user.username || user.fullName || "Unknown", remarks, body.itemId, user.companyId]
  );
  return NextResponse.json({ message: "Success" });
});
