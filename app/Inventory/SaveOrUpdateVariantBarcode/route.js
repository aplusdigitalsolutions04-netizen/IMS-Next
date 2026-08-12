import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError, authorizeMasterWrite } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireAuth(user);

  const { BarcodeId, ItemVariantId, Barcode, SubUnitQty } = body;
  const isCreate = !(BarcodeId && BarcodeId !== "0" && BarcodeId !== "");
  authorizeMasterWrite(user, "item", { isCreate });
  const [ownedVariant] = await mysqlPool.query("SELECT itemVariantId FROM inventoryitemvariant WHERE itemVariantId = ? AND companyGuid = ?", [ItemVariantId, user.companyId]);
  if (!ownedVariant.length) throw new ApiError(404, "Item variant not found");

  if (BarcodeId && BarcodeId !== "0" && BarcodeId !== "") {
    const [ownedBarcode] = await mysqlPool.query(
      "SELECT vb.barcodeId FROM inventoryvariantbarcode vb JOIN inventoryitemvariant v ON vb.itemVariantId = v.itemVariantId AND v.companyGuid = ? WHERE vb.barcodeId = ?",
      [user.companyId, BarcodeId]
    );
    if (!ownedBarcode.length) throw new ApiError(404, "Barcode not found");
    await mysqlPool.execute("UPDATE inventoryvariantbarcode SET barcode = ?, subUnitQty = ? WHERE barcodeId = ?", [Barcode, SubUnitQty, BarcodeId]);
  } else {
    await mysqlPool.execute("INSERT INTO inventoryvariantbarcode (barcodeId, itemVariantId, barcode, subUnitQty) VALUES (?, ?, ?, ?)", [uuidv4(), ItemVariantId, Barcode, SubUnitQty]);
  }
  return NextResponse.json({ message: "Success" });
});
