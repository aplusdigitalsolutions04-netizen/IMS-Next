import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, authorizeMasterRead } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeMasterRead(user, "stat_combo");
  requireAuth(user);
  const { pvId } = await params;

  const [rows] = await mysqlPool.query(
    "SELECT m.childVariantId, cv.variantName as variantCode, ci.itemName, m.quantity, u.unitName FROM inventorycombomapping m JOIN inventoryitemvariant cv ON m.childVariantId = cv.itemVariantId JOIN inventoryitemmaster ci ON cv.itemId = ci.itemId LEFT JOIN inventoryunitmaster u ON ci.unitId = u.unitId WHERE m.parentVariantId = ? AND m.isDeleted = 0 AND cv.companyGuid = ?",
    [pvId, user.companyId]
  );
  return NextResponse.json({ data: rows, message: "Success" });
});
