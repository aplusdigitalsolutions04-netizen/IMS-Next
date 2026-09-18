import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { ensureDeletedByColumns } from "@/lib/deletedItemsMigration";

// Deletes a serial added against an Item Master variant (the counterpart to
// AddVariantSerial) — soft-deletes the serial row and, if it was still
// Available, decrements inventoryvariantstock.availablePCS to keep Current
// Stock's quantity in sync. Serials already Dispatched/Sold can't be deleted
// here — that would desync order history; use Returns for those.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);
  requireCompany(user);

  const { serialGuid, remarks } = await parseJsonBody(request);
  if (!serialGuid) throw new ApiError(400, "serialGuid is required.");
  const trimmedRemarks = String(remarks || "").trim();
  if (!trimmedRemarks) throw new ApiError(400, "A remark is required to delete.");
  await ensureDeletedByColumns();

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT guid, itemVariantId, serialStatus FROM inventorystockinserial WHERE guid = ? AND companyGuid = ? AND isDeleted = 0 FOR UPDATE",
      [serialGuid, user.companyId]
    );
    if (!rows.length) throw new ApiError(404, "Serial not found.");
    const serial = rows[0];

    if (serial.serialStatus !== "Available") {
      throw new ApiError(400, `This serial is "${serial.serialStatus}" and can't be deleted directly — use Returns instead.`);
    }

    await conn.query(
      "UPDATE inventorystockinserial SET isDeleted = 1, deletedBy = ?, deletedAt = NOW(), deleteRemarks = ? WHERE guid = ?",
      [user.username || user.fullName || "Unknown", trimmedRemarks, serialGuid]
    );

    if (serial.itemVariantId) {
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
