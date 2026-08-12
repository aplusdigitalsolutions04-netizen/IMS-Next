import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, authorizeMasterRead } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterRead(user, "stat_item");
  requireAuth(user);

  const itemVariantId = new URL(request.url).searchParams.get("itemVariantId");
  const [rows] = await mysqlPool.query(
    `SELECT vb.barcodeId as BarcodeId, vb.barcode as Barcode, vb.subUnitQty as SubUnitQty
     FROM inventoryvariantbarcode vb
     JOIN inventoryitemvariant v ON vb.itemVariantId = v.itemVariantId AND v.companyGuid = ?
     WHERE vb.itemVariantId = ? AND vb.isDeleted = 0`,
    [user.companyId, itemVariantId]
  );
  return NextResponse.json({ message: "Success", data: rows });
});
