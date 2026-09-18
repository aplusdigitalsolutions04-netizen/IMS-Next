import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Name-based counterpart to LookupBarcode — lets Stock In add a line by
// searching for the item instead of scanning a barcode (for stock that never
// got a barcode mapped, or when the physical barcode isn't handy). Same row
// shape as LookupBarcode's response so the frontend can feed either straight
// into the existing processVariantSelection/Unit-selection flow unchanged.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);

  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ data: [], message: "Success" });

  const like = `%${q}%`;
  const [rows] = await mysqlPool.query(`
    SELECT
      v.itemVariantId,
      v.variantName as variantCode,
      i.itemName,
      u.unitName,
      i.isTrackable as hasSerialNumber,
      IFNULL(s.lastPurchaseRate, 0) as lastPurchaseRate,
      NULL as modelGuid,
      0 as isModelItem
    FROM inventoryitemvariant v
    JOIN inventoryitemmaster i ON v.itemId = i.itemId
    LEFT JOIN inventoryunitmaster u ON i.unitId = u.unitId
    LEFT JOIN inventoryvariantstock s ON v.itemVariantId = s.itemVariantId
    WHERE v.isDeleted = 0 AND i.isDeleted = 0 AND v.companyGuid = ?
      AND (i.itemName LIKE ? OR v.variantName LIKE ?)
    ORDER BY i.itemName ASC, v.variantName ASC
    LIMIT 20
  `, [user.companyId, like, like]);

  return NextResponse.json({ data: rows, message: "Success" });
});
