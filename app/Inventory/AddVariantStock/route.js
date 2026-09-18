import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, requireEditPermission, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { addNonSerializedBatch } from "@/lib/nonSerializedBatchHelpers";

// Adds plain quantity stock directly against an Item Master variant — the
// non-serialized counterpart of AddVariantSerial, for when you just need to
// book stock against an existing model/variant outside the full Stock In
// workflow. Recorded as its own batch (never blended into an existing one),
// same as a regular Stock-In line — see lib/nonSerializedBatchHelpers.js.
// Gated by its own edit-flag (allow_add_nonserialized_stock) rather than the
// broad allow_edit_inventory — delegable independently via Manage Roles.
export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  requireEditPermission(user, "allow_add_nonserialized_stock");

  const { itemVariantId, qty, purchaseRate, godownGuid, vendorId } = await parseJsonBody(request);

  const quantity = Number(qty);
  if (!itemVariantId || !quantity || quantity <= 0) {
    throw new ApiError(400, "itemVariantId and a positive qty are required.");
  }

  const rate = Number(purchaseRate) || 0;

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();

    const [variantRows] = await conn.query(
      `SELECT v.itemVariantId, IFNULL(i.isTrackable, 0) as isTrackable
       FROM inventoryitemvariant v
       LEFT JOIN inventoryitemmaster i ON v.itemId = i.itemId AND i.companyGuid = v.companyGuid
       WHERE v.itemVariantId = ? AND v.isDeleted = 0 FOR UPDATE`,
      [itemVariantId]
    );
    if (!variantRows.length) throw new ApiError(404, "Variant not found.");
    // Mirrors the UI gate in components/itemMaster/ItemVariant.jsx (which
    // only shows Add Stock for non-trackable items) — enforced here too so a
    // direct API call can't bypass it. Trackable items must go through
    // AddVariantSerial instead.
    if (variantRows[0].isTrackable) {
      throw new ApiError(400, "This item tracks serial numbers — add stock via Serial No. instead.");
    }

    await conn.query(
      `INSERT INTO inventoryvariantstock (itemVariantId, availablePCS, avgPurchaseRate, lastPurchaseRate, lastUpdatedOn)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         avgPurchaseRate = ((availablePCS * avgPurchaseRate) + (VALUES(availablePCS) * VALUES(avgPurchaseRate))) / (availablePCS + VALUES(availablePCS)),
         availablePCS = availablePCS + VALUES(availablePCS),
         lastPurchaseRate = VALUES(lastPurchaseRate),
         lastUpdatedOn = NOW()`,
      [itemVariantId, quantity, rate, rate]
    );

    await conn.query(
      "UPDATE inventoryitemvariant SET purchasePrice = ? WHERE itemVariantId = ?",
      [rate, itemVariantId]
    );

    if (godownGuid) {
      await conn.query(
        `INSERT INTO inventorygodownstock (itemVariantId, godownGuid, availablePCS) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE availablePCS = availablePCS + VALUES(availablePCS)`,
        [itemVariantId, godownGuid, quantity]
      );
    }

    await addNonSerializedBatch(conn, {
      companyGuid: user.companyId,
      itemVariantId,
      godownGuid: godownGuid || null,
      stockInDetailId: null,
      purchaseRate: rate,
      qty: quantity,
      vendorId: vendorId || null,
    });

    await conn.commit();
    return NextResponse.json({ message: "Success" });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});
