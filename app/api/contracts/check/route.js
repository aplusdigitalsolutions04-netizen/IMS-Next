import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, requirePermission } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  requirePermission(user, "contracts", "You do not have permission to access contracts.");

  const { searchParams } = new URL(request.url);
  const contractNumber = (searchParams.get("contractNumber") || "").trim();
  if (!contractNumber) return NextResponse.json({ exists: false });

  const [rows] = await mysqlPool.query(
    "SELECT guid FROM contracts WHERE contractNumber=? AND companyGuid=? AND isDeleted=0",
    [contractNumber, user.companyId]
  );
  if (rows.length > 0) {
    return NextResponse.json({ exists: true, reason: "duplicate" });
  }

  // Same lookup as POST /api/contracts (orderid == contractNumber) — a
  // contract already turned into an order can't be uploaded again, so this
  // is checked here too, up front, before the caller spends an AI extraction
  // call on a contract number that will be rejected at save time anyway.
  const [existingOrder] = await mysqlPool.query(
    "SELECT status FROM orders WHERE orderid=? AND companyGuid=? AND isDeleted=0 LIMIT 1",
    [contractNumber, user.companyId]
  );
  if (existingOrder.length > 0) {
    return NextResponse.json({ exists: true, reason: "order", orderStatus: existingOrder[0].status });
  }

  return NextResponse.json({ exists: false });
});
