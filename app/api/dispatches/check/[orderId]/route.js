import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeDispatchRequest, requireCompany } from "@/lib/auth";
import { safeStr } from "@/lib/helpers";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeDispatchRequest(user, "GET", null);
  const { orderId } = await params;

  const safeOrderId = safeStr(orderId, "");
  if (!safeOrderId || safeOrderId.toLowerCase() === "n/a") {
    return NextResponse.json({ exists: false });
  }

  const [existing] = await mysqlPool.query(
    "SELECT guid FROM orders WHERE (orderid = ? OR customerName = ?) AND isDeleted = 0 AND companyGuid = ? LIMIT 1",
    [safeOrderId, safeOrderId, user.companyId]
  );

  return NextResponse.json({ exists: existing.length > 0 });
});
