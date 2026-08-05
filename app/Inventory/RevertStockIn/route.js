import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);

  const { stockInId } = body;
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    // Locks the row and confirms it's actually finalized (status = 1) before
    // doing any of the stock decrements below — without this, a double-click
    // or retry on an already-reverted stock-in would try to decrement stock
    // a second time (silently succeeding if unrelated stock-ins happened to
    // replenish the same item variant in between, which would then be a real
    // data-corrupting duplicate decrement, not just a harmless no-op).
    const [[stockInRow]] = await connection.query("SELECT status FROM inventorystockin WHERE stockInId = ? FOR UPDATE", [stockInId]);
    if (!stockInRow) throw new ApiError(404, "Stock-in not found");
    if (stockInRow.status !== 1) throw new ApiError(400, "This stock-in has already been reverted (or was never finalized).");

    const [details] = await connection.query(`
      SELECT d.*, i.useSerialTab
      FROM inventorystockindetail d
      LEFT JOIN inventoryitemvariant v ON d.itemVariantId = v.itemVariantId
      LEFT JOIN inventoryitemmaster i ON v.itemId = i.itemId
      WHERE d.stockInId = ? AND d.isDeleted = 0
    `, [stockInId]);

    for (const item of details) {
      if (item.itemVariantId) {
        const [itemSerials] = await connection.query("SELECT serialNumber, serialStatus FROM inventorystockinserial WHERE stockInDetailId = ? AND isDeleted = 0", [item.stockInDetailId]);
        if (item.useSerialTab && itemSerials.length > 0) {
          for (const s of itemSerials) {
            if (s.serialStatus && s.serialStatus !== "Available") {
              throw new Error(`Cannot revert: Serial ${s.serialNumber} is already ${s.serialStatus}.`);
            }
            await connection.execute(
              "UPDATE inventorystockinserial SET guid = NULL, companyGuid = NULL, godownGuid = NULL, landingPrice = 0, serialStatus = 'Available' WHERE stockInDetailId = ? AND serialNumber = ?",
              [item.stockInDetailId, s.serialNumber]
            );
          }
        } else {
          const qty = item.stockInQty * item.defaultPcsQty;
          const [result] = await connection.execute(
            "UPDATE inventoryvariantstock SET availablePCS = availablePCS - ? WHERE itemVariantId = ? AND availablePCS >= ?",
            [qty, item.itemVariantId, qty]
          );
          if (result.affectedRows === 0) {
            const [[stockRow]] = await connection.query("SELECT availablePCS FROM inventoryvariantstock WHERE itemVariantId = ?", [item.itemVariantId]);
            throw new Error(stockRow
              ? `Cannot revert: available stock (${stockRow.availablePCS}) is less than the stock-in quantity (${qty}) — some may have already been issued.`
              : `Stock record not found for item variant ${item.itemVariantId}`);
          }

          if (item.godownGuid) {
            await connection.execute(
              "UPDATE inventorygodownstock SET availablePCS = availablePCS - ? WHERE itemVariantId = ? AND godownGuid = ? AND availablePCS >= ?",
              [qty, item.itemVariantId, item.godownGuid, qty]
            );
          }
        }
      }
    }

    await connection.execute("UPDATE inventorystockin SET status = 0, finalizedOn = NULL WHERE stockInId = ? AND status = 1", [stockInId]);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  return NextResponse.json({ message: "Success" });
});
