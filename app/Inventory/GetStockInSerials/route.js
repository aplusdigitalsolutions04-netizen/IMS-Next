import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);

  const detailId = new URL(request.url).searchParams.get("detailId");
  const [rows] = await mysqlPool.query("SELECT serialId, serialNumber FROM inventorystockinserial WHERE stockInDetailId = ? AND isDeleted = 0 AND companyGuid = ?", [detailId, user.companyId]);
  return NextResponse.json({ data: rows, message: "Success" });
});
