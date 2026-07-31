import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);
  requireCompany(user);

  const {
    ItemVariantId, ItemId, VariantCode, Mrp,
    ColorType, PrinterType, Cpu, Ram, SsdHdd,
    ScreenSize, Resolution, PanelType, RefreshRate,
    PackagingCost, PackageLength, PackageWidth, PackageHeight, PackageWeight,
  } = body;
  const safeMrp = Mrp !== undefined && Mrp !== null && Mrp !== "" ? Number(Mrp) : null;
  const safeNum = (v) => (v !== undefined && v !== null && v !== "" ? Number(v) : null);
  let finalItemVariantId = ItemVariantId;

  if (ItemVariantId && ItemVariantId !== "0" && ItemVariantId !== "") {
    await mysqlPool.execute(
      `UPDATE inventoryitemvariant SET
         variantName = ?,
         sellingPrice = COALESCE(?, sellingPrice),
         colorType = ?, printerType = ?, cpu = ?, ram = ?, ssdHdd = ?,
         screenSize = ?, resolution = ?, panelType = ?, refreshRate = ?,
         packagingCost = COALESCE(?, packagingCost),
         packageLength = ?, packageWidth = ?, packageHeight = ?, packageWeight = ?
       WHERE itemVariantId = ? AND companyGuid = ?`,
      [
        VariantCode, safeMrp,
        ColorType || null, PrinterType || null, Cpu || null, Ram || null, SsdHdd || null,
        ScreenSize || null, Resolution || null, PanelType || null, RefreshRate || null,
        safeNum(PackagingCost),
        safeNum(PackageLength), safeNum(PackageWidth), safeNum(PackageHeight), safeNum(PackageWeight),
        ItemVariantId, user.companyId,
      ]
    );
  } else {
    finalItemVariantId = uuidv4();
    await mysqlPool.execute(
      `INSERT INTO inventoryitemvariant
         (itemVariantId, companyGuid, itemId, variantName, sellingPrice,
          colorType, printerType, cpu, ram, ssdHdd, screenSize, resolution, panelType, refreshRate,
          packagingCost, packageLength, packageWidth, packageHeight, packageWeight)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalItemVariantId, user.companyId, ItemId, VariantCode, safeMrp || 0,
        ColorType || null, PrinterType || null, Cpu || null, Ram || null, SsdHdd || null,
        ScreenSize || null, Resolution || null, PanelType || null, RefreshRate || null,
        safeNum(PackagingCost) || 0, safeNum(PackageLength), safeNum(PackageWidth), safeNum(PackageHeight), safeNum(PackageWeight),
      ]
    );
  }

  return NextResponse.json({ message: "Success", itemVariantId: finalItemVariantId });
});
