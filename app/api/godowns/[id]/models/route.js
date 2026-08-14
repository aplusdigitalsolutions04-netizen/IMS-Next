import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany } from "@/lib/auth";
import { authorizeGodownTransfer } from "@/lib/godownsAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Lists every item in Current Stock (serialized AND non-serialized) so the
// Godown Transfer picker always has something to choose from — serialized
// availability is a live count of Available serials already sitting in THIS
// godown (transferring only what's really there); non-serialized shows the
// company's total available quantity, since non-serialized stock was never
// tracked per-godown before this feature existed.
//
// This is Godown Transfer-specific data (per-godown stock breakdown), not
// general Godown Master data, so it's gated on "godownTransfer" — a
// godownMaster-only role can manage godowns themselves but shouldn't get to
// browse stock-by-godown through this picker without transfer rights too.
export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeGodownTransfer(user, "GET");
  requireCompany(user);
  const { id } = await params;

  const [rows] = await mysqlPool.query(
    `SELECT itv.itemVariantId as modelId, itv.variantName as modelName, i.itemName, 1 as isTrackable,
       IFNULL(sc.availableCount, 0) as availableCount
     FROM inventoryitemvariant itv
     JOIN inventoryitemmaster i ON itv.itemId=i.itemId AND i.isTrackable=1
     LEFT JOIN (
       SELECT itemVariantId, COUNT(*) as availableCount FROM inventorystockinserial
       WHERE godownGuid=? AND serialStatus='Available' AND isDeleted=0 GROUP BY itemVariantId
     ) sc ON itv.itemVariantId=sc.itemVariantId
     WHERE itv.isDeleted=0 AND itv.companyGuid=?

     UNION ALL

     SELECT itv.itemVariantId as modelId, itv.variantName as modelName, i.itemName, 0 as isTrackable,
       IFNULL(s.availablePCS, 0) as availableCount
     FROM inventoryitemvariant itv
     JOIN inventoryitemmaster i ON itv.itemId=i.itemId AND i.isTrackable=0
     LEFT JOIN inventoryvariantstock s ON itv.itemVariantId=s.itemVariantId
     WHERE itv.isDeleted=0 AND itv.companyGuid=?

     ORDER BY modelName ASC`,
    [id, user.companyId, user.companyId]
  );
  return NextResponse.json(rows);
});
