import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { ensureDeletedByColumns } from "@/lib/deletedItemsMigration";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);

  const { detailId } = body;
  await ensureDeletedByColumns();

  const [[detail]] = await mysqlPool.query("SELECT stockInId FROM inventorystockindetail WHERE stockInDetailId = ?", [detailId]);
  if (detail) {
    const [[si]] = await mysqlPool.query("SELECT status FROM inventorystockin WHERE stockInId = ?", [detail.stockInId]);
    if (si && si.status === 1) throw new ApiError(400, "This stock-in is finalized — revert it first to remove items.");
  }

  // The line's staged serials (not yet stock) go with it; otherwise they linger
  // and block those serial numbers from being entered again.
  await mysqlPool.execute(
    "UPDATE inventorystockinserial SET isDeleted = 1, deletedBy = ?, deletedAt = NOW() WHERE stockInDetailId = ? AND isDeleted = 0 AND (serialStatus IS NULL OR guid IS NULL)",
    [user.username || user.fullName || "Unknown", detailId]
  );
  await mysqlPool.execute("UPDATE inventorystockindetail SET isDeleted = 1 WHERE stockInDetailId = ?", [detailId]);
  return NextResponse.json({ message: "Success" });
});
