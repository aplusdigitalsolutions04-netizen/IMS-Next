import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeDispatchRequest, requireCompany } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeDispatchRequest(user, "GET", null);

  const [rows] = await mysqlPool.query(`
    SELECT COUNT(oi.guid) as total,
      SUM(CASE WHEN o.isDeleted=0 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN o.status='Delivered' AND o.isDeleted=0 THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN o.status='In Transit' AND o.isDeleted=0 THEN 1 ELSE 0 END) as inTransit,
      SUM(CASE WHEN o.status='Cancelled' AND o.isDeleted=0 THEN 1 ELSE 0 END) as cancelled
    FROM order_items oi JOIN orders o ON oi.orderGuid=o.guid
    WHERE oi.companyGuid=?
  `, [user.companyId]);
  return NextResponse.json(rows[0]);
});
