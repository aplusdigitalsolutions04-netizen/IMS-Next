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

  // A dispatched/sold order_item keeps its own itemVariantId forever (see
  // createDispatchInline/createNonSerializedDispatchInline in
  // lib/dispatchHelpers.js — it's set at dispatch time and never changes),
  // and every place that resolves an order's Model/Company name for display
  // (Global Search, Order Tracking, ORDER_SELECT) joins through
  // inventoryitemvariant filtered to isDeleted = 0. Deleting the variant out
  // from under real order history doesn't remove that history — it just
  // makes its Model/Company silently go blank everywhere, with no trace of
  // why. Block it here instead, the same way DeleteVariantSerial already
  // blocks deleting a serial that's still Dispatched/Sold.
  const [[usage]] = await mysqlPool.query(
    "SELECT COUNT(*) as cnt FROM order_items WHERE itemVariantId = ? AND companyGuid = ?",
    [itemVariantId, user.companyId]
  );
  if (usage.cnt > 0) {
    throw new ApiError(400, `Can't delete — this variant appears in ${usage.cnt} order(s)' history. Deleting it would make their Model/Company go blank everywhere. Transfer or remove those first if it's genuinely unused.`);
  }

  await mysqlPool.execute(
    "UPDATE inventoryitemvariant SET isDeleted = 1, deletedBy = ?, deletedAt = NOW(), deleteRemarks = ? WHERE itemVariantId = ? AND companyGuid = ?",
    [user.username || user.fullName || "Unknown", remarks, itemVariantId, user.companyId]
  );
  return NextResponse.json({ message: "Success" });
});
