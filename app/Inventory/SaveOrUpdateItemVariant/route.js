import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
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
  authorizeInventory(user, "POST");
  requireAuth(user);
  requireCompany(user);

  const { ItemVariantId, ItemId, VariantCode, Mrp, Specs } = body;
  const safeMrp = Mrp !== undefined && Mrp !== null && Mrp !== "" ? Number(Mrp) : null;
  let finalItemVariantId = ItemVariantId;

  if (ItemVariantId && ItemVariantId !== "0" && ItemVariantId !== "") {
    await mysqlPool.execute(
      `UPDATE inventoryitemvariant SET
         variantName = ?,
         sellingPrice = COALESCE(?, sellingPrice)
       WHERE itemVariantId = ? AND companyGuid = ?`,
      [VariantCode, safeMrp, ItemVariantId, user.companyId]
    );
  } else {
    finalItemVariantId = uuidv4();
    await mysqlPool.execute(
      `INSERT INTO inventoryitemvariant (itemVariantId, companyGuid, itemId, variantName, sellingPrice)
       VALUES (?, ?, ?, ?, ?)`,
      [finalItemVariantId, user.companyId, ItemId, VariantCode, safeMrp || 0]
    );
  }

  await saveSpecValues(user.companyId, finalItemVariantId, Specs);

  return NextResponse.json({ message: "Success", itemVariantId: finalItemVariantId });
});
