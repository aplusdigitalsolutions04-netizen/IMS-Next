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
           r.refundStatus, COALESCE(r.refundAmount, 0) as refundAmount, r.rowColor, r.tags
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

  const { serialNumber, serialValue, condition, returnDate, returnedBy, dispatchId, reason, refundStatus, refundAmount } = await parseJsonBody(request);
  const trimmed = String(serialNumber || serialValue || "").trim();
  if (!trimmed) throw new ApiError(400, "Serial number is required");

  const VALID_REFUND_STATUSES = ["Full", "Partial", "None"];
  const finalRefundStatus = VALID_REFUND_STATUSES.includes(refundStatus) ? refundStatus : null;
  const finalRefundAmount = finalRefundStatus === "None" ? 0 : (Number.isFinite(Number(refundAmount)) ? Number(refundAmount) : 0);

  const conn = await mysqlPool.getConnection();
  let response;
  try {
    await conn.beginTransaction();

    const [serialCheck] = await conn.query(
      `SELECT s.guid, s.serialStatus, s.itemVariantId, s.serialNumber as serialValue, s.returnCount, s.fbfFbaType,
              itv.variantName as modelName
       FROM inventorystockinserial s
       LEFT JOIN inventoryitemvariant itv ON s.itemVariantId=itv.itemVariantId AND itv.companyGuid=?
       WHERE UPPER(s.serialNumber)=? AND s.isDeleted=0 AND s.companyGuid=? FOR UPDATE`,
      [cid, trimmed.toUpperCase(), cid]
    );
    if (!serialCheck.length) { await conn.rollback(); throw new ApiError(404, `Serial number "${trimmed}" not found`); }
    const serial = serialCheck[0];
    // 'Sold' only ever comes from FBF/FBA sell-out (see
    // app/api/fbf-fba/sell-out/route.js) — a customer returning that sale
    // has no order_items/orders row to look up (FBF/FBA sales never create
    // one), so this whole flow skips the dispatch/order lookup below and
    // goes straight to flipping the serial's status back. Re-attempting a
    // return on the same serial after this naturally fails here too, since
    // its status is no longer "Sold" (or "Dispatched") once processed.
    const isFbfFbaSoldReturn = serial.serialStatus === "Sold";
    if (serial.serialStatus !== "Dispatched" && !isFbfFbaSoldReturn) { await conn.rollback(); throw new ApiError(400, `Cannot return: Item status is "${serial.serialStatus}"`); }

    const VALID_CONDITIONS = ["Good", "InStock", "Damaged"];
    const rawCondition = condition || "Good";
    if (!VALID_CONDITIONS.includes(rawCondition)) { await conn.rollback(); throw new ApiError(400, `Invalid condition. Must be one of: ${VALID_CONDITIONS.join(", ")}`); }
    let finalCondition = rawCondition;
    let newStatus = "Available";
    if (finalCondition === "InStock" || finalCondition === "Good") { finalCondition = "Good"; newStatus = "Available"; }
    else if (finalCondition === "Damaged") { newStatus = "Damaged"; }

    let dispatch = null;
    if (!isFbfFbaSoldReturn) {
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
      dispatch = dispatchInfo[0] || null;
      if (!dispatch?.guid) { await conn.rollback(); throw new ApiError(400, "No linked order found for this serial"); }

      const [dupCheck] = await conn.query("SELECT guid FROM returns WHERE serialNumberGuid=? AND dispatchGuid=? AND isDeleted=0 AND companyGuid=? LIMIT 1", [serial.guid, dispatch.guid, cid]);
      if (dupCheck.length > 0) { await conn.rollback(); throw new ApiError(400, `Return already recorded for order #${dispatch.guid}`); }
    }

    const [countCheck] = await conn.query("SELECT COUNT(*) as total FROM returns WHERE serialNumberGuid=? AND isDeleted=0 AND companyGuid=?", [serial.guid, cid]);
    const returnCount = (countCheck[0].total || 0) + 1;

    const returnPlatform = isFbfFbaSoldReturn ? (serial.fbfFbaType || "FBF/FBA") : (dispatch.firmName || null);
    const returnOrderLabel = isFbfFbaSoldReturn ? "FBF/FBA Sale" : (dispatch.customerName || null);

    const returnGuid = randomUUID();
    await conn.query(
      "INSERT INTO returns (guid,companyGuid,serialNumberGuid,serialValue,`condition`,returnDate,returnedBy,platform,orderid,returnCount,isDeleted,dispatchGuid,invoiceNumber,reason,refundStatus,refundAmount) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)",
      [returnGuid, cid, serial.guid, trimmed, finalCondition, returnDate ? new Date(returnDate) : new Date(), returnedBy || "System",
        returnPlatform, returnOrderLabel, returnCount, isFbfFbaSoldReturn ? null : dispatch.guid, isFbfFbaSoldReturn ? null : (dispatch.invoiceNumber || null), String(reason || "").trim(),
        finalRefundStatus, finalRefundAmount]
    );

    // Also clears fbfFbaType/warehouseGuid for a sold-return — sell-out never
    // cleared them when it set serialStatus='Sold', so without this the item
    // would look like it's still tied to an FBF/FBA warehouse even though
    // it's back in main inventory now.
    if (isFbfFbaSoldReturn) {
      await conn.query("UPDATE inventorystockinserial SET serialStatus=?, returnCount=?, fbfFbaType=NULL, warehouseGuid=NULL WHERE guid=? AND companyGuid=?", [newStatus, returnCount, serial.guid, cid]);
    } else {
      await conn.query("UPDATE inventorystockinserial SET serialStatus=?, returnCount=? WHERE guid=? AND companyGuid=?", [newStatus, returnCount, serial.guid, cid]);
    }

    if (!isFbfFbaSoldReturn) {
      const [itemCheck] = await conn.query("SELECT orderGuid FROM order_items WHERE guid=? AND companyGuid=?", [dispatch.guid, cid]);
      if (itemCheck.length) {
        const orderGuid = itemCheck[0].orderGuid;
        const [total] = await conn.query("SELECT COUNT(*) as total FROM order_items WHERE orderGuid=? AND companyGuid=?", [orderGuid, cid]);
        const [returned] = await conn.query("SELECT COUNT(DISTINCT serialNumberGuid) as total FROM returns WHERE dispatchGuid IN (SELECT guid FROM order_items WHERE orderGuid=? AND companyGuid=?) AND isDeleted=0 AND companyGuid=?", [orderGuid, cid, cid]);
        const newOrderStatus = returned[0].total >= total[0].total ? "Returned" : "Partially Returned";
        await conn.query("UPDATE orders SET status=? WHERE guid=? AND companyGuid=?", [newOrderStatus, orderGuid, cid]);
      }
    }

    const movementNotes = isFbfFbaSoldReturn ? `Returned by customer (was sold via ${returnPlatform})` : `Returned from order #${dispatch.guid}`;
    await recordSerialMovement(conn, { companyGuid: cid, serialNumberGuid: serial.guid, serialValue: serial.serialValue, dispatchGuid: isFbfFbaSoldReturn ? null : dispatch.guid, actionType: "Returned", status: "Returned", condition: finalCondition, reason: String(reason || "").trim(), firmName: returnPlatform, customerName: returnOrderLabel, invoiceNumber: isFbfFbaSoldReturn ? null : dispatch.invoiceNumber, createdAt: returnDate || new Date(), createdBy: returnedBy || "System", notes: movementNotes });
    await recordSerialMovement(conn, { companyGuid: cid, serialNumberGuid: serial.guid, serialValue: serial.serialValue, dispatchGuid: null, actionType: finalCondition === "Damaged" ? "Damaged" : "InStock", status: newStatus, condition: finalCondition, reason: String(reason || "").trim(), firmName: returnPlatform, customerName: returnOrderLabel, invoiceNumber: isFbfFbaSoldReturn ? null : dispatch.invoiceNumber, createdAt: returnDate ? new Date(new Date(returnDate).getTime() + 1000) : new Date(), createdBy: returnedBy || "System", notes: finalCondition === "Damaged" ? "Moved to damaged stock after return" : "Restocked after return" });

    await conn.commit();
    response = { message: "Return processed successfully", id: returnGuid, serialValue: trimmed, condition: finalCondition, status: newStatus, dispatchId: isFbfFbaSoldReturn ? null : dispatch.guid, invoiceNumber: isFbfFbaSoldReturn ? null : dispatch.invoiceNumber, reason: String(reason || "").trim(), refundStatus: finalRefundStatus, refundAmount: finalRefundAmount };
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
