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

  const { warrantyStartDate } = await parseJsonBody(request);
  const [itemRows] = await mysqlPool.query("SELECT guid FROM order_items WHERE guid=? AND companyGuid=?", [id, user.companyId]);
  if (!itemRows.length) throw new ApiError(404, "Order item not found");

  await mysqlPool.query("UPDATE order_items SET warrantyStartDate=? WHERE guid=? AND companyGuid=?", [safeDate(warrantyStartDate) || null, id, user.companyId]);
  return NextResponse.json({ message: "Warranty start date updated" });
});
