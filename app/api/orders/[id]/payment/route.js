import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeOrdersRequest, requireAuth, requireCompany, ApiError } from "@/lib/auth";
import { safeDate } from "@/lib/helpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);
  authorizeOrdersRequest(user, "PUT", new URL(request.url).pathname, null);
  const { id } = await params;

  const { paymentDate, amount, utrId, status, paymentType, settlementDeduction } = await parseJsonBody(request);
  const numAmount = Number(amount);
  const numDeduction = Number(settlementDeduction || 0);
  if (!Number.isFinite(numAmount) || numAmount < 0) throw new ApiError(400, "Invalid payment amount.");
  if (!Number.isFinite(numDeduction) || numDeduction < 0) throw new ApiError(400, "Invalid settlement deduction amount.");

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();
    try {
      // A plain "check then insert-or-update" here left a window where two
      // concurrent submits (double-click, or a retried request) could both
      // see "no existing payment" and both INSERT, creating two payment rows
      // for the same dispatch and inflating recorded revenue. A single
      // atomic INSERT ... ON DUPLICATE KEY UPDATE (backed by a unique
      // constraint on payments(dispatchGuid, companyGuid)) closes that
      // window entirely — there's no read-then-write gap for a race to land in.
      await conn.query(
        `INSERT INTO payments (guid,companyGuid,dispatchGuid,paymentDate,amount,utrId,paymentType,settlementDeduction)
         VALUES (UUID(),?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE paymentDate=VALUES(paymentDate), amount=VALUES(amount), utrId=VALUES(utrId), paymentType=VALUES(paymentType), settlementDeduction=VALUES(settlementDeduction)`,
        [user.companyId, id, safeDate(paymentDate), numAmount, utrId, paymentType || "Full", numDeduction]
      );
      const [itemRows] = await conn.query("SELECT orderGuid FROM order_items WHERE guid=? AND companyGuid=?", [id, user.companyId]);
      if (itemRows.length) {
        await conn.query("UPDATE orders SET status=? WHERE guid=? AND companyGuid=?", [status || "Completed", itemRows[0].orderGuid, user.companyId]);
        await conn.query("UPDATE order_logistics SET logisticsStatus=CASE WHEN logisticsStatus!='Delivered' THEN 'Delivered' ELSE logisticsStatus END WHERE orderGuid=? AND companyGuid=?", [itemRows[0].orderGuid, user.companyId]);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  } finally {
    conn.release();
  }
  return NextResponse.json({ message: "Payment recorded and order completed." });
});
