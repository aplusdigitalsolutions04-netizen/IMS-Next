import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeReturns } from "@/lib/returnsAuth";
import { recordSerialMovement } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeReturns(user, "PUT");
  const { id } = await params;

  const { condition, repairCost, reason, refundStatus, refundAmount } = await parseJsonBody(request);
  const [existing] = await mysqlPool.query(`
    SELECT r.guid, r.serialNumberGuid, s.serialNumber as serialValue, r.condition, r.reason,
           r.platform AS firmName, r.orderid AS customerName, r.invoiceNumber, r.dispatchGuid
    FROM returns r LEFT JOIN inventorystockinserial s ON s.guid=r.serialNumberGuid AND s.companyGuid=r.companyGuid WHERE r.guid=? AND r.companyGuid=?
  `, [id, user.companyId]);
  if (!existing.length) throw new ApiError(404, "Return not found");
  const ext = existing[0];

  const setClauses = [], sqlParams = [];
  if (condition !== undefined) { setClauses.push("`condition`=?"); sqlParams.push(condition); }
  if (repairCost !== undefined) { setClauses.push("repairCost=?"); sqlParams.push(repairCost); }
  if (reason !== undefined) { setClauses.push("reason=?"); sqlParams.push(reason); }
  // Refund info often isn't known yet at return time (marketplace/customer
  // confirms it later) — this is what lets it be filled in or corrected
  // afterward instead of being stuck at whatever (or nothing) was entered
  // during the original return.
  if (refundStatus !== undefined) {
    const VALID_REFUND_STATUSES = ["Full", "Partial", "None"];
    if (!VALID_REFUND_STATUSES.includes(refundStatus)) throw new ApiError(400, `Invalid refund status. Must be one of: ${VALID_REFUND_STATUSES.join(", ")}`);
    setClauses.push("refundStatus=?"); sqlParams.push(refundStatus);
  }
  if (refundAmount !== undefined) {
    const safeAmount = refundStatus === "None" ? 0 : Number(refundAmount);
    if (!Number.isFinite(safeAmount) || safeAmount < 0) throw new ApiError(400, "Refund amount must be a valid non-negative number");
    setClauses.push("refundAmount=?"); sqlParams.push(safeAmount);
  }

  if (setClauses.length) { sqlParams.push(id, user.companyId); await mysqlPool.query(`UPDATE returns SET ${setClauses.join(",")} WHERE guid=? AND companyGuid=?`, sqlParams); }

  if (condition !== undefined) {
    const newStatus = ["Repaired", "Good", "InStock"].includes(condition) ? "Available" : "Damaged";
    await mysqlPool.query("UPDATE inventorystockinserial SET serialStatus=? WHERE guid=? AND companyGuid=?", [newStatus, ext.serialNumberGuid, user.companyId]);
    await recordSerialMovement(mysqlPool, { companyGuid: user.companyId, serialNumberGuid: ext.serialNumberGuid, serialValue: ext.serialValue, dispatchGuid: ext.dispatchGuid, actionType: newStatus === "Available" ? "InStock" : "Damaged", status: newStatus, condition, reason: reason !== undefined ? reason : ext.reason, firmName: ext.firmName, customerName: ext.customerName, invoiceNumber: ext.invoiceNumber, createdBy: "System", notes: `Inventory status updated from return #${id}` });
  }

  return NextResponse.json({ message: "Return updated successfully" });
});

export const DELETE = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeReturns(user, "DELETE");
  const { id } = await params;

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();

    const [check] = await conn.query(`
      SELECT r.guid, r.serialNumberGuid, COALESCE(NULLIF(r.serialValue,''),s.serialNumber,'') as serialValue,
             r.condition, r.reason, r.platform AS firmName, r.orderid AS customerName, r.invoiceNumber, r.dispatchGuid
      FROM returns r LEFT JOIN inventorystockinserial s ON s.guid=r.serialNumberGuid AND s.companyGuid=r.companyGuid WHERE r.guid=? AND r.companyGuid=? LIMIT 1 FOR UPDATE
    `, [id, user.companyId]);
    if (!check.length) throw new ApiError(404, "Return not found");
    const rec = check[0];

    await conn.query("UPDATE returns SET isDeleted=1 WHERE guid=? AND companyGuid=?", [id, user.companyId]);
    const [cnt] = await conn.query("SELECT COUNT(*) as total FROM returns WHERE serialNumberGuid=? AND isDeleted=0 AND companyGuid=?", [rec.serialNumberGuid, user.companyId]);

    // A return created via the FBF/FBA "Sold" path (app/api/returns/route.js)
    // never has a dispatchGuid — that's the only way returns end up with one
    // (the regular path always requires a real linked order, or fails).
    // Blindly resetting to 'Dispatched' here was wrong for that case: the
    // serial was never dispatched through Order Processing, so it'd end up
    // 'Dispatched' with no order behind it. Restore it to 'Sold' instead,
    // and recover its FBF/FBA type from the return's stored platform where
    // possible (warehouseGuid isn't recoverable — never stored on the
    // return record — so it stays cleared, same as it's been since the
    // return was processed).
    const isFbfFbaSoldReturn = !rec.dispatchGuid;
    const restoredStatus = isFbfFbaSoldReturn ? "Sold" : "Dispatched";
    const restoredFbfFbaType = isFbfFbaSoldReturn && ["FBF", "FBA"].includes(rec.firmName) ? rec.firmName : null;
    await conn.query(
      "UPDATE inventorystockinserial SET serialStatus=?, returnCount=?, fbfFbaType=? WHERE guid=? AND companyGuid=?",
      [restoredStatus, cnt[0].total, restoredFbfFbaType, rec.serialNumberGuid, user.companyId]
    );

    if (rec.dispatchGuid) {
      const [item] = await conn.query("SELECT orderGuid FROM order_items WHERE guid=? AND companyGuid=?", [rec.dispatchGuid, user.companyId]);
      if (item.length) {
        const og = item[0].orderGuid;
        const [tot] = await conn.query("SELECT COUNT(*) as total FROM order_items WHERE orderGuid=? AND companyGuid=?", [og, user.companyId]);
        const [ret] = await conn.query("SELECT COUNT(DISTINCT serialNumberGuid) as total FROM returns WHERE dispatchGuid IN (SELECT guid FROM order_items WHERE orderGuid=? AND companyGuid=?) AND isDeleted=0 AND companyGuid=?", [og, user.companyId, user.companyId]);
        const ns = ret[0].total === 0 ? "Delivered" : ret[0].total >= tot[0].total ? "Returned" : "Partially Returned";
        await conn.query("UPDATE orders SET status=? WHERE guid=? AND companyGuid=?", [ns, og, user.companyId]);
      }
    }

    await recordSerialMovement(conn, { companyGuid: user.companyId, serialNumberGuid: rec.serialNumberGuid, serialValue: rec.serialValue, dispatchGuid: rec.dispatchGuid, actionType: "ReturnDeleted", status: restoredStatus, condition: rec.condition, reason: rec.reason, firmName: rec.firmName, customerName: rec.customerName, invoiceNumber: rec.invoiceNumber, createdBy: "System", notes: isFbfFbaSoldReturn ? `Return #${id} was deleted and FBF/FBA sold status restored` : `Return #${id} was deleted and order context restored` });

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return NextResponse.json({ message: "Return record deleted successfully" });
});
