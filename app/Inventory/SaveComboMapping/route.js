import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, authorizeMasterWrite } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);

  let { parentVariantId, components, comboName } = body;
  authorizeMasterWrite(user, "combo", { isCreate: parentVariantId === "NEW" });

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    if (parentVariantId === "NEW") {
      const [items] = await connection.execute("SELECT itemId FROM inventoryitemmaster WHERE itemName = 'SYSTEM_COMBOS' AND companyGuid = ? LIMIT 1", [user.companyId]);
      let itemId;
      if (items.length > 0) {
        itemId = items[0].itemId;
      } else {
        itemId = `ITEM-COMBO-${Date.now()}`;
        const [[anyCat]] = await connection.query("SELECT categoryId FROM inventorycategorymaster WHERE companyGuid = ? LIMIT 1", [user.companyId]);
        const [[anyBrand]] = await connection.query("SELECT brandId FROM inventorybrandmaster WHERE companyGuid = ? LIMIT 1", [user.companyId]);
        const [[anyUnit]] = await connection.query("SELECT unitId FROM inventoryunitmaster WHERE companyGuid = ? LIMIT 1", [user.companyId]);
        await connection.execute(
          "INSERT INTO inventoryitemmaster (itemId, companyGuid, itemName, categoryId, brandId, unitId) VALUES (?, ?, ?, ?, ?, ?)",
          [itemId, user.companyId, "SYSTEM_COMBOS", anyCat?.categoryId || null, anyBrand?.brandId || null, anyUnit?.unitId || null]
        );
      }

      parentVariantId = uuidv4();
      await connection.execute(
        "INSERT INTO inventoryitemvariant (itemVariantId, companyGuid, itemId, variantName, sku) VALUES (?, ?, ?, ?, ?)",
        [parentVariantId, user.companyId, itemId, comboName, `CB-${Date.now()}`]
      );
    } else if (comboName) {
      await connection.execute("UPDATE inventoryitemvariant SET variantName = ? WHERE itemVariantId = ? AND companyGuid = ?", [comboName, parentVariantId, user.companyId]);
    }

    await connection.execute("UPDATE inventorycombomapping SET isDeleted = 1 WHERE parentVariantId = ?", [parentVariantId]);

    for (const comp of components) {
      if (comp.childVariantId) {
        await connection.execute(
          "INSERT INTO inventorycombomapping (parentVariantId, childVariantId, quantity) VALUES (?, ?, ?)",
          [parentVariantId, comp.childVariantId, comp.quantity || 1]
        );
      }
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    console.error("SQL Transaction Error:", err);
    throw err;
  } finally {
    connection.release();
  }
  return NextResponse.json({ message: "Saved successfully" });
});
