import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeDispatchRequest, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeDispatchRequest(user, "PUT", body);

  const { ids, rowColor, tags } = body;
  if (!Array.isArray(ids) || !ids.length) throw new ApiError(400, "No IDs provided");
  await mysqlPool.query(
    "UPDATE orders o JOIN order_items oi ON o.guid=oi.orderGuid SET o.rowColor=?,o.tags=? WHERE oi.guid IN (?) AND o.companyGuid=?",
    [rowColor || null, tags || null, ids, user.companyId]
  );
  return NextResponse.json({ message: "Batch appearance updated successfully" });
});
