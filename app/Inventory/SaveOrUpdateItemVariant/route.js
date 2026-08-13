import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, authorizeMasterWrite } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Persists the dynamic category-specification values (Specs: { [specificationId]: value })
// against inventoryitemvariantspecvalue. An empty/blank value deletes the row instead of
// storing an empty string, so cleared fields don't linger.
async function saveSpecValues(companyGuid, itemVariantId, specs) {
  if (!specs || typeof specs !== "object") return;
  for (const [specificationId, rawValue] of Object.entries(specs)) {
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (value === "" || value === null || value === undefined) {
      await mysqlPool.execute(
        "DELETE FROM inventoryitemvariantspecvalue WHERE itemVariantId = ? AND specificationId = ?",
        [itemVariantId, specificationId]
      );
    } else {
      await mysqlPool.execute(
        `INSERT INTO inventoryitemvariantspecvalue (companyGuid, itemVariantId, specificationId, value)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [companyGuid, itemVariantId, specificationId, value]
      );
    }
  }
}

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);

  const { ItemVariantId, ItemId, VariantCode, Mrp, Specs, PurchaseRate } = body;
  const safeMrp = Mrp !== undefined && Mrp !== null && Mrp !== "" ? Number(Mrp) : null;
  const safePurchaseRate = PurchaseRate !== undefined && PurchaseRate !== null && PurchaseRate !== "" ? Number(PurchaseRate) : null;
  let finalItemVariantId = ItemVariantId;
  const isCreate = !(ItemVariantId && ItemVariantId !== "0" && ItemVariantId !== "");
  authorizeMasterWrite(user, "item", { isCreate });

  if (ItemVariantId && ItemVariantId !== "0" && ItemVariantId !== "") {
    await mysqlPool.execute(
      `UPDATE inventoryitemvariant SET
         variantName = ?,
         sellingPrice = COALESCE(?, sellingPrice),
         purchasePrice = COALESCE(?, purchasePrice)
       WHERE itemVariantId = ? AND companyGuid = ?`,
      [VariantCode, safeMrp, safePurchaseRate, ItemVariantId, user.companyId]
    );
  } else {
    finalItemVariantId = uuidv4();
    await mysqlPool.execute(
      `INSERT INTO inventoryitemvariant (itemVariantId, companyGuid, itemId, variantName, sellingPrice, purchasePrice)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [finalItemVariantId, user.companyId, ItemId, VariantCode, safeMrp || 0, safePurchaseRate || 0]
    );
  }

  await saveSpecValues(user.companyId, finalItemVariantId, Specs);

  return NextResponse.json({ message: "Success", itemVariantId: finalItemVariantId });
});
