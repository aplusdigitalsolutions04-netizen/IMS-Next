import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeOrdersRequest, requireCompany, ApiError } from "@/lib/auth";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Converts a Draft order into a real active order. Each draft order_item
// (which has no serialNumberGuid/modelGuid yet, just a quantity) is
// replaced either:
//   - for a serialized model: one order_item row per unit, each pinned to a
//     real, available serial (serials get marked Dispatched), or
//   - for a non-serialized model (stationery/consumables — models.isSerialized
//     = 0): a single order_item row carrying the quantity, with
//     models.stockQuantity decremented instead of touching the serials table.
// Either way the order moves from status 'Draft' to 'Pending' so it shows up
// as an active order.
export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  const { orderId } = await params;
  authorizeOrdersRequest(user, "POST", new URL(request.url).pathname, null);

  const body = await parseJsonBody(request);
  const { items } = body;

  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "At least one item selection is required to confirm the order.");
  }

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderRows] = await conn.query(
      "SELECT guid FROM orders WHERE guid = ? AND companyGuid = ? AND status = 'Draft' FOR UPDATE",
      [orderId, user.companyId]
    );
    if (!orderRows.length) {
      throw new ApiError(404, "Draft order not found.");
    }

    for (const item of items) {
      const { draftItemGuid, modelGuid, serialGuids, nonSerialized } = item;
      if (!draftItemGuid || !modelGuid) {
        throw new ApiError(400, "Each item requires a model.");
      }
      if (!nonSerialized && (!Array.isArray(serialGuids) || serialGuids.length === 0)) {
        throw new ApiError(400, "Each serialized item requires at least one serial number.");
      }

      const [draftItemRows] = await conn.query(
        "SELECT sellingPrice, quantity, remarks, contractFilename, warranty FROM order_items WHERE guid = ? AND orderGuid = ? AND companyGuid = ?",
        [draftItemGuid, orderId, user.companyId]
      );
      if (!draftItemRows.length) {
        throw new ApiError(404, `Draft item ${draftItemGuid} not found.`);
      }
      const draftItem = draftItemRows[0];
      const quantity = Number(draftItem.quantity) || 1;

      if (nonSerialized) {
        // The picker's `modelGuid` is an itemVariantId (the established
        // convention for Item-Master-only products, same as everywhere else
        // in the app — the legacy `models` table has been retired).
        const [variantRows] = await conn.query(
          "SELECT v.itemVariantId, i.isTrackable FROM inventoryitemvariant v JOIN inventoryitemmaster i ON v.itemId = i.itemId WHERE v.itemVariantId = ? AND v.isDeleted = 0",
          [modelGuid]
        );
        if (!variantRows.length) throw new ApiError(404, "Selected model not found.");
        if (variantRows[0].isTrackable) throw new ApiError(400, "Selected item is serialized — pick serial numbers for it instead.");

        const [stockResult] = await conn.query(
          "UPDATE inventoryvariantstock SET availablePCS = availablePCS - ? WHERE itemVariantId = ? AND availablePCS >= ?",
          [quantity, modelGuid, quantity]
        );
        if (stockResult.affectedRows === 0) {
          const [[stockRow]] = await conn.query("SELECT availablePCS FROM inventoryvariantstock WHERE itemVariantId = ?", [modelGuid]);
          throw new ApiError(400, stockRow ? `Not enough stock — only ${stockRow.availablePCS} available for this item.` : "Stock record not found for this item.");
        }

        const newItemGuid = randomUUID();
        await conn.query(
          `INSERT INTO order_items
             (guid,companyGuid,orderGuid,modelGuid,itemVariantId,sellingPrice,quantity,contractFilename,remarks,warranty)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [newItemGuid, user.companyId, orderId, modelGuid, modelGuid, Number(draftItem.sellingPrice) || 0, quantity, draftItem.contractFilename || null, draftItem.remarks || null, draftItem.warranty || null]
        );

        await conn.query("DELETE FROM order_items WHERE guid = ? AND companyGuid = ?", [draftItemGuid, user.companyId]);
        continue;
      }

      if (serialGuids.length !== quantity) {
        throw new ApiError(400, `Expected ${quantity} serial number(s) for this item, got ${serialGuids.length}.`);
      }
      const perUnitPrice = (Number(draftItem.sellingPrice) || 0) / quantity;

      // `modelGuid` here may be a real legacy `models` row's guid — resolve it
      // to its migrated itemVariantId (same convention used elsewhere) since
      // inventorystockinserial only ever keys off itemVariantId.
      const [mappedModel] = await conn.query(
        "SELECT itemVariantId FROM model_itemvariant_map WHERE modelGuid COLLATE utf8mb4_unicode_ci = ?",
        [modelGuid]
      );
      const resolvedItemVariantId = mappedModel[0]?.itemVariantId || modelGuid;

      for (const serialGuid of serialGuids) {
        const [serialRows] = await conn.query(
          "SELECT serialStatus as status, serialNumber as value, itemVariantId FROM inventorystockinserial WHERE guid = ? AND companyGuid = ? FOR UPDATE",
          [serialGuid, user.companyId]
        );
        if (!serialRows.length) throw new ApiError(404, `Serial ${serialGuid} not found.`);
        if (serialRows[0].status !== "Available") throw new ApiError(400, `Serial ${serialRows[0].value} is not available.`);
        if (String(serialRows[0].itemVariantId) !== String(resolvedItemVariantId)) {
          throw new ApiError(400, `Serial ${serialRows[0].value} does not belong to the selected model.`);
        }

        await conn.query("UPDATE inventorystockinserial SET serialStatus = 'Dispatched' WHERE guid = ? AND companyGuid = ?", [serialGuid, user.companyId]);

        const newItemGuid = randomUUID();
        await conn.query(
          `INSERT INTO order_items
             (guid,companyGuid,orderGuid,serialNumberGuid,modelGuid,itemVariantId,sellingPrice,contractFilename,remarks,warranty)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [newItemGuid, user.companyId, orderId, serialGuid, modelGuid, serialRows[0].itemVariantId, perUnitPrice, draftItem.contractFilename || null, draftItem.remarks || null, draftItem.warranty || null]
        );

        await conn.query(
          `INSERT INTO serialmovements
             (guid,companyGuid,serialNumberGuid,serialValue,dispatchGuid,actionType,status,createdBy,notes,createdAt)
           VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
          [randomUUID(), user.companyId, serialGuid, serialRows[0].value, newItemGuid, "Dispatched", "Dispatched", user.username || "System", `Assigned from draft order #${orderId}`]
        );
      }

      await conn.query("DELETE FROM order_items WHERE guid = ? AND companyGuid = ?", [draftItemGuid, user.companyId]);
    }

    // 'Order Confirmed' — not 'Pending' — is the status every other order
    // creation path uses (see NewDispatch.jsx's initial status) and the one
    // OrderTracking's "Send for Billing" button checks for
    // (components/orderTracking/OrderTracking.jsx). Using a different string
    // here meant a confirmed draft order could never show that button.
    await conn.query(
      "UPDATE orders SET status = 'Order Confirmed', dispatchedBy = ?, dispatchDate = NOW() WHERE guid = ? AND companyGuid = ?",
      [user.username || "System", orderId, user.companyId]
    );

    await conn.commit();
    broadcastRealtimeEvent(user.companyId, "orders");
    return NextResponse.json({ message: "Order confirmed and moved to active orders." }, { status: 200 });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});
