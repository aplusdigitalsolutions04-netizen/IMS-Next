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

// The legacy `models`/`serials` tables have been fully retired — every
// "model" is now a serialized (trackable) Item Master variant. This picker
// endpoint (used by Dispatch/NewDispatch/OrderTracking/FbfFbaManagement) is
// kept for its response shape, but sourced entirely from Item Master.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorize(user, "GET");

  const companyGuid = resolveScopedCompanyGuid(user, request);
  const ivClause = companyGuid ? "AND itv.companyGuid = ?" : "";
  const ivParams = companyGuid ? [companyGuid] : [];

  // stockCount is a live count of Available serials — inventoryvariantstock's
  // availablePCS is only ever incremented (Stock In, Add Serial No.) and
  // never decremented on dispatch, so it drifts stale for trackable items.
  const [rows] = await mysqlPool.query(`
    SELECT itv.itemVariantId as guid, itv.itemVariantId as id, itv.variantName as name,
      i.itemName as itemName,
      b.brandName as company, 1 as isSerialized, IFNULL(sc.availableCount,0) as stockCount,
      s.lastPurchaseRate as lastLandingPrice
    FROM inventoryitemvariant itv
    JOIN inventoryitemmaster i ON itv.itemId=i.itemId AND i.isDeleted=0 AND i.isTrackable=1
    JOIN companies co ON itv.companyGuid=co.guid AND co.isActive=1
    LEFT JOIN inventorybrandmaster b ON i.brandId=b.brandId
    LEFT JOIN inventoryvariantstock s ON itv.itemVariantId=s.itemVariantId
    LEFT JOIN (
      SELECT itemVariantId, COUNT(*) as availableCount FROM inventorystockinserial
      WHERE serialStatus = 'Available' AND isDeleted = 0 GROUP BY itemVariantId
    ) sc ON itv.itemVariantId=sc.itemVariantId
    WHERE itv.isDeleted=0 ${ivClause}
    ORDER BY i.itemName ASC, itv.variantName ASC
  `, ivParams);

  return NextResponse.json(rows);
});
