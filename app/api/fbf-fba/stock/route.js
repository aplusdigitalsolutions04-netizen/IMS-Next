import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany } from "@/lib/auth";
import { authorizeFbfFba } from "@/lib/fbfFbaAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeFbfFba(user, "GET");

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // FBF or FBA
  const [rows] = await mysqlPool.query(`
    SELECT
        s.*,
        w.platform as whPlatform,
        w.state as whState,
        w.warehouseName as whName,
        COALESCE(miv.variantName, i.itemName) as modelName,
        COALESCE(mb.brandName, b.brandName) as company,
        CASE WHEN s.itemKind = 'serialized' THEN 1 ELSE 0 END as isSerialized,
        (SELECT GROUP_CONCAT(serialNumber) FROM inventorystockinserial WHERE serialStatus = s.type AND itemVariantId = s.modelGuid AND isDeleted = 0 AND companyGuid = s.companyGuid) as activeSerials
    FROM fbf_fba_stock s
    LEFT JOIN inventoryitemvariant miv ON s.modelGuid = miv.itemVariantId
    LEFT JOIN inventoryitemmaster mim ON miv.itemId = mim.itemId
    LEFT JOIN inventorybrandmaster mb ON mim.brandId = mb.brandId
    LEFT JOIN inventoryitemmaster i ON s.itemId = i.itemId
    LEFT JOIN inventorybrandmaster b ON i.brandId = b.brandId
    LEFT JOIN fbf_fba_warehouses w ON s.warehouseGuid = w.guid
    WHERE s.type = ? AND s.quantity > 0 AND s.companyGuid = ?
    ORDER BY whPlatform ASC, whName ASC, modelName ASC
  `, [type, user.companyId]);
  return NextResponse.json(rows);
});
