import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, requirePermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";
import { ensureRestoreColumns } from "@/lib/deletedItemsMigration";

// Counterpart to GET /api/admin/deleted-items — flips isDeleted back to 0,
// and always records who restored it, when, and why (restoreRemarks is
// required — see the popup in components/admin/DeletedItems.jsx). This is
// tracked separately from the delete-side deletedBy/deletedAt/deleteRemarks
// columns, not overwritten, so a row's delete history stays visible even
// after it's brought back.
// Deliberately minimal per type otherwise, rather than trying to fully
// "undo" every side effect a delete may have had:
// - Orders: status is left exactly as it was (usually "Order Cancelled")
//   rather than guessed back to some prior value — Admin can change it from
//   Order Processing afterward if needed.
// - Serials: only re-adds to inventoryvariantstock.availablePCS when the
//   restored row is actually "Available" — a serial deleted while
//   Dispatched/Sold (possible via the standalone Serials page's delete,
//   which — unlike Item Master's DeleteVariantSerial — never required
//   Available status first) comes back exactly as it was, not silently
//   marked available again.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "deletedItems", "Only Admin can restore deleted items.");
  await ensureRestoreColumns();

  const { type, id, remarks } = await parseJsonBody(request);
  if (!type || !id) throw new ApiError(400, "type and id are required.");
  const trimmedRemarks = String(remarks || "").trim();
  if (!trimmedRemarks) throw new ApiError(400, "A remark is required to restore.");
  const restoredBy = user.username || user.fullName || "Unknown";

  if (type === "orders") {
    const [result] = await mysqlPool.query(
      "UPDATE orders SET isDeleted = 0, restoredBy = ?, restoredAt = NOW(), restoreRemarks = ? WHERE guid = ? AND companyGuid = ? AND isDeleted = 1",
      [restoredBy, trimmedRemarks, id, user.companyId]
    );
    if (result.affectedRows === 0) throw new ApiError(404, "Deleted order not found.");
    broadcastRealtimeEvent(user.companyId, "orders");
    return NextResponse.json({ message: "Order restored." });
  }

  if (type === "contracts") {
    const [result] = await mysqlPool.query(
      "UPDATE contracts SET isDeleted = 0, restoredBy = ?, restoredAt = NOW(), restoreRemarks = ? WHERE guid = ? AND companyGuid = ? AND isDeleted = 1",
      [restoredBy, trimmedRemarks, id, user.companyId]
    );
    if (result.affectedRows === 0) throw new ApiError(404, "Deleted contract not found.");
    broadcastRealtimeEvent(user.companyId, "contracts");
    return NextResponse.json({ message: "Contract restored." });
  }

  if (type === "item") {
    const [result] = await mysqlPool.query(
      "UPDATE inventoryitemmaster SET isDeleted = 0, restoredBy = ?, restoredAt = NOW(), restoreRemarks = ? WHERE itemId = ? AND companyGuid = ? AND isDeleted = 1",
      [restoredBy, trimmedRemarks, id, user.companyId]
    );
    if (result.affectedRows === 0) throw new ApiError(404, "Deleted item not found.");
    return NextResponse.json({ message: "Item restored." });
  }

  if (type === "variant") {
    const [result] = await mysqlPool.query(
      "UPDATE inventoryitemvariant SET isDeleted = 0, restoredBy = ?, restoredAt = NOW(), restoreRemarks = ? WHERE itemVariantId = ? AND companyGuid = ? AND isDeleted = 1",
      [restoredBy, trimmedRemarks, id, user.companyId]
    );
    if (result.affectedRows === 0) throw new ApiError(404, "Deleted variant not found.");
    return NextResponse.json({ message: "Variant restored." });
  }

  if (type === "serials") {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        "SELECT itemVariantId, serialStatus FROM inventorystockinserial WHERE guid = ? AND companyGuid = ? AND isDeleted = 1 FOR UPDATE",
        [id, user.companyId]
      );
      if (!rows.length) throw new ApiError(404, "Deleted serial not found.");
      const serial = rows[0];

      await conn.query(
        "UPDATE inventorystockinserial SET isDeleted = 0, restoredBy = ?, restoredAt = NOW(), restoreRemarks = ? WHERE guid = ?",
        [restoredBy, trimmedRemarks, id]
      );

      if (serial.itemVariantId && serial.serialStatus === "Available") {
        await conn.query(
          "UPDATE inventoryvariantstock SET availablePCS = availablePCS + 1 WHERE itemVariantId = ?",
          [serial.itemVariantId]
        );
      }

      await conn.commit();
      return NextResponse.json({ message: "Serial restored." });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  throw new ApiError(400, `Unknown type "${type}".`);
});
