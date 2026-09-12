import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeDispatchRequest, requireCompany } from "@/lib/auth";
import { safeStr, parseJsonArray } from "@/lib/helpers";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeDispatchRequest(user, "GET", null);
  const { orderId } = await params;

  const safeOrderId = safeStr(orderId, "");
  if (!safeOrderId || safeOrderId.toLowerCase() === "n/a") {
    return NextResponse.json({ exists: false, contractProducts: null });
  }

  const [existing] = await mysqlPool.query(
    "SELECT guid FROM orders WHERE (orderid = ? OR customerName = ?) AND isDeleted = 0 AND companyGuid = ? LIMIT 1",
    [safeOrderId, safeOrderId, user.companyId]
  );

  // Purely informational — a GeM contract's extracted products are the
  // "what was actually ordered" reference, shown alongside whatever gets
  // dispatched so a deliberate substitution (buyer wants a different model
  // than the contract) is visible later, not blocked. Contracts link to an
  // order only by contractNumber == orderid (see app/api/contracts/route.js),
  // there's no FK, so this is the same string match used everywhere else.
  const [contractRows] = await mysqlPool.query(
    "SELECT products FROM contracts WHERE contractNumber = ? AND companyGuid = ? AND isDeleted = 0 LIMIT 1",
    [safeOrderId, user.companyId]
  );
  const contractProducts = contractRows.length > 0 ? parseJsonArray(contractRows[0].products) : null;

  return NextResponse.json({ exists: existing.length > 0, contractProducts });
});
