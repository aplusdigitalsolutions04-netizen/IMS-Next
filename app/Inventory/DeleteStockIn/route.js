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

  const { stockInId } = body;
  await ensureDeletedByColumns();
  const [[si]] = await mysqlPool.query("SELECT status FROM inventorystockin WHERE stockInId = ?", [stockInId]);
  if (si && si.status === 1) throw new ApiError(400, "This stock-in is finalized — revert it first, then delete.");
  const [detailRows] = await mysqlPool.query("SELECT stockInDetailId FROM inventorystockindetail WHERE stockInId = ?", [stockInId]);

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    if (detailRows.length > 0) {
      // A stock-in can only be deleted once it is NOT finalized, so none of its serials may be live stock any more.
      // Serials staged by a revert have no status/guid; serials left over from OLDER reverts (before revert cleared
      // them) are still marked 'Available' — those kept counting in Current Stock after the stock-in was deleted,
      // with no stock-in left to show their serial numbers. Delete those too (never ones already sold/dispatched).
      await connection.query(
        "UPDATE inventorystockinserial SET isDeleted = 1, deletedBy = ?, deletedAt = NOW() WHERE stockInDetailId IN (?) AND isDeleted = 0 AND (serialStatus IS NULL OR guid IS NULL OR serialStatus = 'Available')",
        [user.username || user.fullName || "Unknown", detailRows.map((d) => d.stockInDetailId)]
      );
    }
    await connection.execute("UPDATE inventorystockin SET isDeleted = 1 WHERE stockInId = ?", [stockInId]);
    await connection.execute("UPDATE inventorystockindetail SET isDeleted = 1 WHERE stockInId = ?", [stockInId]);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  return NextResponse.json({ message: "Success" });
});
