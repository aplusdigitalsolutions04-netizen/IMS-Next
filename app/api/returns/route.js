import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, ApiError, requireCompany, resolveScopedCompanyGuid } from "@/lib/auth";
import { authorizeReturns } from "@/lib/returnsAuth";
import { recordSerialMovement } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeReturns(user, "GET");

  const cid = resolveScopedCompanyGuid(user, request);
  const c = (alias) => (cid ? `AND ${alias}.companyGuid=?` : "");
  const w = (alias) => (cid ? `AND ${alias}.companyGuid=?` : "");

  const [printerRows] = await mysqlPool.query(`
    SELECT r.guid as id, r.serialNumberGuid as serialNumberId,
           COALESCE(NULLIF(r.serialValue,''), s.serialNumber, '') as serialValue,
           r.condition, r.returnDate, r.returnedBy, r.platform AS firmName, r.orderid AS customerName,
           r.reason, r.repairCost, r.returnCount, r.dispatchGuid, itv.variantName as modelName,
           0 as refundAmount, r.rowColor, r.tags
    FROM returns r
    JOIN companies co ON r.companyGuid=co.guid AND co.isActive=1
    LEFT JOIN inventorystockinserial s ON r.serialNumberGuid=s.guid ${c("s")} LEFT JOIN inventoryitemvariant itv ON s.itemVariantId=itv.itemVariantId ${c("itv")}
    WHERE r.isDeleted=0 ${w("r")}
  `, cid ? [cid, cid, cid] : []);
  const [stationeryRows] = await mysqlPool.query(`
    SELECT r.returnId as id, r.stockOutId as dispatchId, r.originalItemSent as serialValue,
           IF(r.isConditionCorrect=1,'Correct','Damaged') as \`condition\`,
           r.createdAt as returnDate, r.createdBy as returnedBy,
           o.platformId as firmName, COALESCE(o.orderId,o.issuedBy,'Unknown') as customerName,
           r.compensationAmount as refundAmount, r.remarks as reason,
           'Stationery' as modelName, 0 as repairCost, 1 as returnCount, r.rowColor, r.tags
    FROM inventorystationeryreturns r
    JOIN companies co ON r.companyGuid=co.guid AND co.isActive=1
    LEFT JOIN inventorystockout o ON r.stockOutId=o.stockOutId ${c("o")}
    WHERE r.isDeleted=0 ${w("r")}
  `, cid ? [cid, cid] : []);
  const all = [...printerRows, ...stationeryRows].sort((a, b) => new Date(b.returnDate) - new Date(a.returnDate));
  return NextResponse.json(all);
});

export const POST = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeReturns(user, "POST");

  const cid = user.companyId;

  const { serialNumber, serialValue, condition, returnDate, returnedBy, dispatchId, reason } = await parseJsonBody(request);
  const trimmed = String(serialNumber || serialValue || "").trim();
  if (!trimmed) throw new ApiError(400, "Serial number is required");

  const conn = await mysqlPool.getConnection();
  let response;
  try {
    await conn.beginTransaction();

    const [serialCheck] = await conn.query(
      `SELECT s.guid, s.serialStatus, s.modelGuid, s.itemVariantId, s.serialNumber as serialValue, s.returnCount,
              itv.variantName as modelName
       FROM inventorystockinserial s
       LEFT JOIN inventoryitemvariant itv ON s.itemVariantId=itv.itemVariantId AND itv.companyGuid=?
       WHERE UPPER(s.serialNumber)=? AND s.isDeleted=0 AND s.companyGuid=? FOR UPDATE`,
      [cid, trimmed.toUpperCase(), cid]
    );
    if (!serialCheck.length) { await conn.rollback(); throw new ApiError(404, `Serial number "${trimmed}" not found`); }
    const serial = serialCheck[0];
    if (serial.serialStatus !== "Dispatched") { await conn.rollback(); throw new ApiError(400, `Cannot return: Item status is "${serial.serialStatus}"`); }

    const VALID_CONDITIONS = ["Good", "InStock", "Damaged"];
    const rawCondition = condition || "Good";
    if (!VALID_CONDITIONS.includes(rawCondition)) { await conn.rollback(); throw new ApiError(400, `Invalid condition. Must be one of: ${VALID_CONDITIONS.join(", ")}`); }
    let finalCondition = rawCondition;
    let newStatus = "Available";
    if (finalCondition === "InStock" || finalCondition === "Good") { finalCondition = "Good"; newStatus = "Available"; }
    else if (finalCondition === "Damaged") { newStatus = "Damaged"; }

    // 'Partially Returned' must NOT be excluded here — an order gets that
    // status the moment its *first* item is returned, so excluding it would
    // wrongly block returning any of the order's other still-dispatched
    // items. The per-serial duplicate check below (dupCheck) is what
    // actually prevents returning the same serial twice.
    let dQuery = `SELECT oi.guid, o.dispatchDate, o.platform AS firmName, o.orderid AS customerName, o.invoiceNumber, o.status as orderStatus, ol.logisticsStatus
      FROM order_items oi JOIN orders o ON oi.orderGuid=o.guid AND o.companyGuid=? LEFT JOIN order_logistics ol ON o.guid=ol.orderGuid AND ol.companyGuid=?
      WHERE oi.serialNumberGuid=? AND o.isDeleted=0 AND oi.companyGuid=? AND o.status NOT IN ('Returned','Order Cancelled')`;
    const dParams = [cid, cid, serial.guid, cid];
    if (dispatchId) { dQuery += " AND oi.guid=?"; dParams.push(dispatchId); }
    dQuery += " ORDER BY o.dispatchDate DESC, oi.guid DESC LIMIT 1";

    const [dispatchInfo] = await conn.query(dQuery, dParams);
    const dispatch = dispatchInfo[0] || null;
    if (!dispatch?.guid) { await conn.rollback(); throw new ApiError(400, "No linked order found for this serial"); }

    const [dupCheck] = await conn.query("SELECT guid FROM returns WHERE serialNumberGuid=? AND dispatchGuid=? AND isDeleted=0 AND companyGuid=? LIMIT 1", [serial.guid, dispatch.guid, cid]);
    if (dupCheck.length > 0) { await conn.rollback(); throw new ApiError(400, `Return already recorded for order #${dispatch.guid}`); }

    const [countCheck] = await conn.query("SELECT COUNT(*) as total FROM returns WHERE serialNumberGuid=? AND isDeleted=0 AND companyGuid=?", [serial.guid, cid]);
    const returnCount = (countCheck[0].total || 0) + 1;

    const returnGuid = randomUUID();
    await conn.query(
      "INSERT INTO returns (guid,companyGuid,serialNumberGuid,serialValue,`condition`,returnDate,returnedBy,platform,orderid,returnCount,isDeleted,dispatchGuid,invoiceNumber,reason) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?)",
      [returnGuid, cid, serial.guid, trimmed, finalCondition, returnDate ? new Date(returnDate) : new Date(), returnedBy || "System",
        dispatch.firmName || null, dispatch.customerName || null, returnCount, dispatch.guid, dispatch.invoiceNumber || null, String(reason || "").trim()]
    );

    await conn.query("UPDATE inventorystockinserial SET serialStatus=?, returnCount=? WHERE guid=? AND companyGuid=?", [newStatus, returnCount, serial.guid, cid]);

    const [itemCheck] = await conn.query("SELECT orderGuid FROM order_items WHERE guid=? AND companyGuid=?", [dispatch.guid, cid]);
    if (itemCheck.length) {
      const orderGuid = itemCheck[0].orderGuid;
      const [total] = await conn.query("SELECT COUNT(*) as total FROM order_items WHERE orderGuid=? AND companyGuid=?", [orderGuid, cid]);
      const [returned] = await conn.query("SELECT COUNT(DISTINCT serialNumberGuid) as total FROM returns WHERE dispatchGuid IN (SELECT guid FROM order_items WHERE orderGuid=? AND companyGuid=?) AND isDeleted=0 AND companyGuid=?", [orderGuid, cid, cid]);
      const newOrderStatus = returned[0].total >= total[0].total ? "Returned" : "Partially Returned";
      await conn.query("UPDATE orders SET status=? WHERE guid=? AND companyGuid=?", [newOrderStatus, orderGuid, cid]);
    }

    await recordSerialMovement(conn, { companyGuid: cid, serialNumberGuid: serial.guid, serialValue: serial.serialValue, dispatchGuid: dispatch.guid, actionType: "Returned", status: "Returned", condition: finalCondition, reason: String(reason || "").trim(), firmName: dispatch.firmName, customerName: dispatch.customerName, invoiceNumber: dispatch.invoiceNumber, createdAt: returnDate || new Date(), createdBy: returnedBy || "System", notes: `Returned from order #${dispatch.guid}` });
    await recordSerialMovement(conn, { companyGuid: cid, serialNumberGuid: serial.guid, serialValue: serial.serialValue, dispatchGuid: null, actionType: finalCondition === "Damaged" ? "Damaged" : "InStock", status: newStatus, condition: finalCondition, reason: String(reason || "").trim(), firmName: dispatch.firmName, customerName: dispatch.customerName, invoiceNumber: dispatch.invoiceNumber, createdAt: returnDate ? new Date(new Date(returnDate).getTime() + 1000) : new Date(), createdBy: returnedBy || "System", notes: finalCondition === "Damaged" ? "Moved to damaged stock after return" : "Restocked after return" });

    await conn.commit();
    response = { message: "Return processed successfully", id: returnGuid, serialValue: trimmed, condition: finalCondition, status: newStatus, dispatchId: dispatch.guid, invoiceNumber: dispatch.invoiceNumber, reason: String(reason || "").trim() };
  } catch (err) {
    if (!(err instanceof ApiError)) await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  broadcastRealtimeEvent(cid, "returns");
  broadcastRealtimeEvent(cid, "serials");
  broadcastRealtimeEvent(cid, "dispatches");
  return NextResponse.json(response, { status: 201 });
});
