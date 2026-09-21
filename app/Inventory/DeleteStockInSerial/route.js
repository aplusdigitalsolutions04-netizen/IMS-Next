import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureDeletedByColumns } from "@/lib/deletedItemsMigration";

// Removes a row from the Stock-In "serial numbers to save" editor
// (StockIn.jsx's per-line serial popup) — meant for a serial that was just
// typed into a still-open Stock-In line, not a fully independent delete.
// GetStockInSerials returns every serial ever saved against that line
// regardless of what happened to it since, so re-opening an OLD (already
// finalized) line's popup and deleting a row here could otherwise reach a
// serial that's long since been Dispatched/Sold — silently desyncing a real
// order's history with no trace. Same guard DeleteVariantSerial already has.
export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);
  requireCompany(user);
  await ensureDeletedByColumns();

  const { serialId } = body;
  if (!serialId) throw new ApiError(400, "serialId is required.");

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT serialId, itemVariantId, serialStatus FROM inventorystockinserial WHERE serialId = ? AND companyGuid = ? AND isDeleted = 0 FOR UPDATE",
      [serialId, user.companyId]
    );
    if (!rows.length) throw new ApiError(404, "Serial not found.");
    const serial = rows[0];

    if (serial.serialStatus && serial.serialStatus !== "Available") {
      throw new ApiError(400, `This serial is "${serial.serialStatus}" and can't be deleted directly — use Returns instead.`);
    }

    await conn.query(
      "UPDATE inventorystockinserial SET isDeleted = 1, deletedBy = ?, deletedAt = NOW() WHERE serialId = ?",
      [user.username || user.fullName || "Unknown", serialId]
    );

    // serialStatus is only ever set to 'Available' by FinalizeStockIn — a
    // still-draft serial (serialStatus NULL, deleted before its Stock-In was
    // ever finalized) was never added to availablePCS in the first place, so
    // decrementing it here for that case would wrongly undercount stock that
    // this serial never contributed to.
    if (serial.itemVariantId && serial.serialStatus === "Available") {
      await conn.query(
        "UPDATE inventoryvariantstock SET availablePCS = GREATEST(availablePCS - 1, 0) WHERE itemVariantId = ?",
        [serial.itemVariantId]
      );
    }

    await conn.commit();
    return NextResponse.json({ message: "Success" });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});
