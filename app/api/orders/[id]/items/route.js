import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeOrdersRequest, requireAuth, requireCompany, ApiError } from "@/lib/auth";
import { mapDispatchRow, recordSerialMovement } from "@/lib/helpers";
import { ORDER_SELECT } from "@/lib/ordersQuery";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  authorizeOrdersRequest(user, "POST", new URL(request.url).pathname, null);
  const { id: orderGuid } = await params;

  const { newSerialId, sellingPrice, warranty, addedBy } = await parseJsonBody(request);
  if (!newSerialId) throw new ApiError(400, "newSerialId is required");

  const [orderRows] = await mysqlPool.query("SELECT guid, platform, customerName FROM orders WHERE guid=? AND isDeleted=0 AND companyGuid=?", [orderGuid, user.companyId]);
  if (!orderRows.length) throw new ApiError(404, "Order not found");
  const order = orderRows[0];

  const newItemGuid = randomUUID();

  const conn = await mysqlPool.getConnection();
  let serRow;
  try {
    await conn.beginTransaction();

    // Locked + checked inside the transaction (not before it) so two
    // concurrent requests for the same serial can't both read "Available"
    // and both proceed — the second request blocks on FOR UPDATE until the
    // first commits, then sees the already-Dispatched status.
    const [serRows] = await conn.query(
      "SELECT *, serialStatus as status, serialNumber as value FROM inventorystockinserial WHERE guid=? AND isDeleted=0 AND companyGuid=? FOR UPDATE",
      [newSerialId, user.companyId]
    );
    if (!serRows.length) throw new ApiError(404, "Serial not found");
    if (serRows[0].status !== "Available") throw new ApiError(400, "Selected serial is not Available");
    serRow = serRows[0];

    await conn.query(
      `INSERT INTO order_items (guid,companyGuid,orderGuid,serialNumberGuid,modelGuid,itemVariantId,sellingPrice,warranty)
       VALUES (?,?,?,?,?,?,?,?)`,
      [newItemGuid, user.companyId, orderGuid, newSerialId, serRow.itemVariantId, serRow.itemVariantId, sellingPrice || 0, warranty || null]
    );
    // Belt-and-suspenders: even with the row locked above, the guard here
    // means this can never flip a serial that isn't Available, regardless
    // of how this query is reached in the future.
    const [updateResult] = await conn.query(
      "UPDATE inventorystockinserial SET serialStatus='Dispatched' WHERE guid=? AND companyGuid=? AND serialStatus='Available'",
      [newSerialId, user.companyId]
    );
    if (updateResult.affectedRows === 0) throw new ApiError(400, "Selected serial is not Available");

    await conn.commit();
  } catch (txErr) {
    await conn.rollback();
    throw txErr;
  } finally {
    conn.release();
  }

  await recordSerialMovement(mysqlPool, {
    companyGuid: user.companyId,
    serialNumberGuid: newSerialId,
    serialValue: serRow.value,
    dispatchGuid: newItemGuid,
    actionType: "Dispatched",
    status: "Dispatched",
    reason: "Added to existing order",
    firmName: order.platform,
    customerName: order.customerName || "",
    createdBy: addedBy || "System",
  });

  const [newRow] = await mysqlPool.query(
    ORDER_SELECT + " WHERE oi.guid=? AND oi.companyGuid=?",
    [...Array(8).fill(user.companyId), newItemGuid, user.companyId]
  );
  return NextResponse.json({ message: "Serial added to order", item: mapDispatchRow(newRow[0]) }, { status: 201 });
});
