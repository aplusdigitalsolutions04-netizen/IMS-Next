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
  return NextResponse.json({ exists: rows.length > 0 });
});
