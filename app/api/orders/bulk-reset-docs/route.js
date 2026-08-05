import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeOrdersRequest, requireAuth, ApiError } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const PUT = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeOrdersRequest(user, "PUT", new URL(request.url).pathname, null);
  requireAuth(user);

  const { items, removeInvoice, removeEwayBill } = await parseJsonBody(request);
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, "No items provided");

  const clauses = [];
  if (removeInvoice) clauses.push("invoiceNumber=NULL", "invoiceFilename=NULL");
  if (removeEwayBill) clauses.push("ewayBillNumber=NULL", "ewayBillFilename=NULL");
  if (clauses.length) {
    const ids = items.map((item) => item.id);
    await mysqlPool.query(`UPDATE orders SET ${clauses.join(",")} WHERE guid IN (?) AND companyGuid=?`, [ids, user.companyId]);
  }
  return NextResponse.json({ message: "Documents reset successfully" });
});
