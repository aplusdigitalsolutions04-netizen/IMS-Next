import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeReadWrite, requireCompany, resolveScopedCompanyGuid } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

const authorize = (user, method) =>
  authorizeReadWrite(user, method, {
    permission: "print_models",
    editColumnName: "allow_edit_models",
    adminOnlyDelete: true,
    denyMessage: "You do not have permission to manage models.",
  });

// Every Item Master variant — serialized AND non-serialized — for Dispatch's
// "Packaging Cost & Dimensions" table. (GET /api/models, the picker used all
// over the app, deliberately lists serialized items only, so it can't feed this.)
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorize(user, "GET");

  const companyGuid = resolveScopedCompanyGuid(user, request);
  const clause = companyGuid ? "AND itv.companyGuid = ?" : "";
  const params = companyGuid ? [companyGuid] : [];

  const [rows] = await mysqlPool.query(`
    SELECT itv.itemVariantId AS guid, itv.itemVariantId AS id, itv.variantName AS name,
      i.itemName, b.brandName AS company, i.isTrackable AS isSerialized,
      itv.packagingCost, itv.packageLength, itv.packageWidth, itv.packageHeight, itv.packageWeight
    FROM inventoryitemvariant itv
    JOIN inventoryitemmaster i ON itv.itemId = i.itemId AND i.isDeleted = 0
    JOIN companies co ON itv.companyGuid = co.guid AND co.isActive = 1
    LEFT JOIN inventorybrandmaster b ON i.brandId = b.brandId
    WHERE itv.isDeleted = 0 AND i.itemName != 'SYSTEM_COMBOS' ${clause}
    ORDER BY i.itemName ASC, itv.variantName ASC
  `, params);

  return NextResponse.json(rows.map((r) => ({ ...r, isSerialized: r.isSerialized ? 1 : 0 })));
});
