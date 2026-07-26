import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeOrdersRequest, requireCompany, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeOrdersRequest(user, "PUT", new URL(request.url).pathname, null);
  const { id } = await params;

  const { status, trackingId, reason, cancelledBy, clearLogistics } = await parseJsonBody(request);
  const [cur] = await mysqlPool.query("SELECT oi.serialNumberGuid, oi.orderGuid FROM order_items oi WHERE oi.guid=? AND oi.companyGuid=?", [id, user.companyId]);
  if (!cur.length) throw new ApiError(404, "Order not found");
  const { serialNumberGuid, orderGuid } = cur[0];

  if (status === "Order Cancelled") {
    await mysqlPool.query("UPDATE inventorystockinserial SET serialStatus='Available' WHERE guid=? AND companyGuid=?", [serialNumberGuid, user.companyId]);
    await mysqlPool.query("UPDATE orders SET status=?,isDeleted=1,cancellationReason=?,cancelledBy=?,cancelledAt=NOW() WHERE guid=? AND companyGuid=?", [status, reason || "No reason", cancelledBy || "Unknown", orderGuid, user.companyId]);
  } else {
    await mysqlPool.query("UPDATE orders SET status=? WHERE guid=? AND isDeleted=0 AND companyGuid=?", [status, orderGuid, user.companyId]);
  }
  if (clearLogistics) {
    await mysqlPool.query("UPDATE order_logistics SET logisticsStatus=NULL, trackingId=NULL WHERE orderGuid=? AND companyGuid=?", [orderGuid, user.companyId]);
  } else {
    await mysqlPool.query("UPDATE order_logistics SET trackingId=? WHERE orderGuid=? AND companyGuid=?", [trackingId || null, orderGuid, user.companyId]);
  }
  return NextResponse.json({ message: "Status updated successfully" });
});
