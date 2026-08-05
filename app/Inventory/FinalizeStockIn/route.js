import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);
  requireCompany(user);

  const { stockInId } = body;
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    // `AND status = 0` makes this idempotent — without it, a double-click or
    // a network retry on an already-finalized stock-in re-runs every stock
    // increment below a second time, silently duplicating the added quantity.
    const [finalizeResult] = await connection.execute(
      "UPDATE inventorystockin SET status = 1, finalizedOn = CURRENT_TIMESTAMP WHERE stockInId = ? AND status = 0",
      [stockInId]
    );
    if (finalizeResult.affectedRows === 0) {
      throw new ApiError(400, "This stock-in has already been finalized.");
    }

    const [details] = await connection.query(`
      SELECT d.*, i.isTrackable
      FROM inventorystockindetail d
      LEFT JOIN inventoryitemvariant v ON d.itemVariantId = v.itemVariantId
      LEFT JOIN inventoryitemmaster i ON v.itemId = i.itemId
      WHERE d.stockInId = ? AND d.isDeleted = 0
    `, [stockInId]);

    for (const item of details) {
      const [stagedSerials] = await connection.query(
        "SELECT serialNumber FROM inventorystockinserial WHERE stockInDetailId = ? AND isDeleted = 0",
        [item.stockInDetailId]
      );

      if (item.itemVariantId) {
        // Item Master variants marked "Ask Serial No. = Yes" (isTrackable):
        // if serials were scanned in Stock In, register each individually and
        // keep inventoryvariantstock's availablePCS in sync (Current Stock
        // reads from there). Non-trackable / no-serials-scanned lines are
        // booked as plain quantity, same as before.
        if (item.isTrackable && stagedSerials.length > 0) {
          for (const s of stagedSerials) {
            await connection.execute(
              "UPDATE inventorystockinserial SET guid = UUID(), companyGuid = ?, godownGuid = ?, landingPrice = ?, serialStatus = 'Available' WHERE stockInDetailId = ? AND serialNumber = ? AND isDeleted = 0",
              [user.companyId, item.godownGuid || null, item.purchaseRate || 0, item.stockInDetailId, s.serialNumber]
            );
          }

          const qty = stagedSerials.length;
          await connection.execute(
            `INSERT INTO inventoryvariantstock (itemVariantId, availablePCS, avgPurchaseRate, lastPurchaseRate) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               avgPurchaseRate = ((availablePCS * avgPurchaseRate) + (VALUES(availablePCS) * VALUES(avgPurchaseRate))) / (availablePCS + VALUES(availablePCS)),
               availablePCS = availablePCS + VALUES(availablePCS),
               lastPurchaseRate = VALUES(lastPurchaseRate)`,
            [item.itemVariantId, qty, item.purchaseRate, item.purchaseRate]
          );
        } else {
          const qty = item.stockInQty * item.defaultPcsQty;
          await connection.execute(
            `INSERT INTO inventoryvariantstock (itemVariantId, availablePCS, avgPurchaseRate, lastPurchaseRate) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               avgPurchaseRate = ((availablePCS * avgPurchaseRate) + (VALUES(availablePCS) * VALUES(avgPurchaseRate))) / (availablePCS + VALUES(availablePCS)),
               availablePCS = availablePCS + VALUES(availablePCS),
               lastPurchaseRate = VALUES(lastPurchaseRate)`,
            [item.itemVariantId, qty, item.purchaseRate, item.purchaseRate]
          );

          // Godown-wise breakdown for non-serialized stock (separate from the
          // global total above) — powers the Godown Stock Transfer picker.
          if (item.godownGuid) {
            await connection.execute(
              `INSERT INTO inventorygodownstock (itemVariantId, godownGuid, availablePCS) VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE availablePCS = availablePCS + VALUES(availablePCS)`,
              [item.itemVariantId, item.godownGuid, qty]
            );
          }
        }
      }
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  return NextResponse.json({ message: "Success" });
});
