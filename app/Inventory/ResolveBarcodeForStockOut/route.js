import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);

  const barcode = new URL(request.url).searchParams.get("barcode");
  const [rows] = await mysqlPool.query(`
    SELECT v.itemVariantId, v.variantName as variantCode, i.itemName, u.unitName, IFNULL(s.availablePCS, 0) as availableQty, i.isTrackable as isSerialItem, 0 as isCombo
    FROM inventoryvariantbarcode vb
    JOIN inventoryitemvariant v ON vb.itemVariantId = v.itemVariantId
    JOIN inventoryitemmaster i ON v.itemId = i.itemId
    LEFT JOIN inventoryunitmaster u ON i.unitId = u.unitId
    LEFT JOIN inventoryvariantstock s ON v.itemVariantId = s.itemVariantId
    WHERE vb.barcode = ? AND v.isDeleted = 0 AND v.companyGuid = ?

    UNION

    SELECT pv.itemVariantId, pv.variantName as variantCode, pi.itemName, 'Combo' as unitName, IFNULL(ps.availablePCS, 0) as availableQty, pi.isTrackable as isSerialItem, 1 as isCombo
    FROM inventoryvariantbarcode vb
    JOIN inventoryitemvariant v ON vb.itemVariantId = v.itemVariantId
    JOIN inventorycombomapping m ON v.itemVariantId = m.childVariantId
    JOIN inventoryitemvariant pv ON m.parentVariantId = pv.itemVariantId
    JOIN inventoryitemmaster pi ON pv.itemId = pi.itemId
    LEFT JOIN inventoryvariantstock ps ON pv.itemVariantId = ps.itemVariantId
    WHERE vb.barcode = ? AND m.isDeleted = 0 AND pv.isDeleted = 0 AND pv.companyGuid = ?
  `, [barcode, user.companyId, barcode, user.companyId]);

  for (const row of rows) {
    if (row.isCombo === 1) {
      const [components] = await mysqlPool.query(
        "SELECT cv.variantName, m.quantity, u.unitName FROM inventorycombomapping m JOIN inventoryitemvariant cv ON m.childVariantId = cv.itemVariantId JOIN inventoryitemmaster ci ON cv.itemId = ci.itemId LEFT JOIN inventoryunitmaster u ON ci.unitId = u.unitId WHERE m.parentVariantId = ? AND m.isDeleted = 0",
        [row.itemVariantId]
      );
      row.components = components;
    }
  }

  return NextResponse.json({ data: rows, message: "Success" });
});
