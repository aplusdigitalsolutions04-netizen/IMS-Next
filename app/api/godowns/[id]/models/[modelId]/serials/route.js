import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany } from "@/lib/auth";
import { authorizeGodownTransfer } from "@/lib/godownsAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Same Transfer-picker-only scoping as ../models/route.js — godownTransfer,
// not godownMaster.
export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeGodownTransfer(user, "GET");
  const { id, modelId } = await params;

  const [rows] = await mysqlPool.query(
    "SELECT guid as id, serialNumber FROM inventorystockinserial WHERE godownGuid=? AND itemVariantId=? AND serialStatus='Available' AND isDeleted=0 AND companyGuid=? ORDER BY serialNumber ASC",
    [id, modelId, user.companyId]
  );
  return NextResponse.json(rows);
});
