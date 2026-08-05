import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);

  const stockInId = new URL(request.url).searchParams.get("stockInId");
  const [rows] = await mysqlPool.query(`
    SELECT
      d.stockInDetailId, d.stockInId, d.itemVariantId, d.modelGuid, d.godownGuid, d.unitId, d.barcode,
      IFNULL(d.stockInQty, 0) as qty, IFNULL(d.defaultPcsQty, 1) as pcs, IFNULL(d.purchaseRate, 0) as rate,
      IFNULL((d.stockInQty * d.purchaseRate), 0) as amount,
      IFNULL(v.variantName, mim.variantName) as variantCode,
      IFNULL(i.itemName, mim.variantName) as itemName,
      IFNULL(u.unitName, '') as unitName,
      IF(d.modelGuid IS NOT NULL, 1, i.isTrackable) as hasSerialNumber,
      (SELECT COUNT(*) FROM inventorystockinserial iss WHERE iss.stockInDetailId = d.stockInDetailId AND iss.isDeleted = 0) as serialCount,
      s.vendorId, s.invoiceNo, s.invoiceDate, s.invoiceFile, s.status as stockInStatus
    FROM inventorystockindetail d
    JOIN inventorystockin s ON d.stockInId = s.stockInId
    LEFT JOIN inventoryitemvariant v ON d.itemVariantId = v.itemVariantId
    LEFT JOIN inventoryitemmaster i ON v.itemId = i.itemId
    LEFT JOIN inventoryunitmaster u ON d.unitId = u.unitId
    LEFT JOIN model_itemvariant_map map ON d.modelGuid COLLATE utf8mb4_unicode_ci = map.modelGuid COLLATE utf8mb4_unicode_ci
    LEFT JOIN inventoryitemvariant mim ON map.itemVariantId COLLATE utf8mb4_unicode_ci = mim.itemVariantId COLLATE utf8mb4_unicode_ci
    WHERE d.stockInId = ? AND d.isDeleted = 0 AND d.companyGuid = ?
  `, [stockInId, user.companyId]);
  return NextResponse.json({ data: rows, message: "Success" });
});
