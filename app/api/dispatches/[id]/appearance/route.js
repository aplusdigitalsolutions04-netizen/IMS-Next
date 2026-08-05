import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeDispatchRequest } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request, { params }) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeDispatchRequest(user, "PUT", body);
  const { id } = await params;

  const { rowColor, tags } = body;
  await mysqlPool.query(
    "UPDATE orders o JOIN order_items oi ON o.guid=oi.orderGuid SET o.rowColor=?,o.tags=? WHERE oi.guid=? AND o.companyGuid=?",
    [rowColor || null, tags || null, id, user.companyId]
  );
  return NextResponse.json({ message: "Appearance updated successfully" });
});
