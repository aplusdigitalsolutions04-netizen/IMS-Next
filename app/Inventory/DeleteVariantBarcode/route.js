import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError, authorizeMasterDelete } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeMasterDelete(user, "item");
  requireAuth(user);

  const { barcodeId } = body;
  const [owned] = await mysqlPool.query(
    "SELECT vb.barcodeId FROM inventoryvariantbarcode vb JOIN inventoryitemvariant v ON vb.itemVariantId = v.itemVariantId AND v.companyGuid = ? WHERE vb.barcodeId = ?",
    [user.companyId, barcodeId]
  );
  if (!owned.length) throw new ApiError(404, "Barcode not found");
  await mysqlPool.execute("UPDATE inventoryvariantbarcode SET isDeleted = 1 WHERE barcodeId = ?", [barcodeId]);
  return NextResponse.json({ message: "Success" });
});
