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

  const { ItemId, CategoryId, BrandId, ItemName, ItemCode, HsnCode, HSNCode, UnitId, IsTrackable, UseSerialTab } = body;
  const finalHsnCode = HsnCode || HSNCode || "";
  let finalItemId = ItemId;
  const isCreate = !(ItemId && ItemId !== "0" && ItemId !== "");
  authorizeMasterWrite(user, "item", { isCreate });
  if (ItemId && ItemId !== "0" && ItemId !== "") {
    await mysqlPool.execute(
      "UPDATE inventoryitemmaster SET categoryId=?, brandId=?, itemName=?, itemCode=?, hsnCode=?, unitId=?, isTrackable=?, useSerialTab=? WHERE itemId=? AND companyGuid=?",
      [CategoryId, BrandId, ItemName, ItemCode, finalHsnCode, UnitId, IsTrackable ? 1 : 0, UseSerialTab ? 1 : 0, ItemId, user.companyId]
    );
  } else {
    finalItemId = uuidv4();
    await mysqlPool.execute(
      "INSERT INTO inventoryitemmaster (itemId, companyGuid, categoryId, brandId, itemName, itemCode, hsnCode, unitId, isTrackable, useSerialTab) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [finalItemId, user.companyId, CategoryId, BrandId, ItemName, ItemCode, finalHsnCode, UnitId, IsTrackable ? 1 : 0, UseSerialTab ? 1 : 0]
    );
  }
  return NextResponse.json({ message: "Success", itemId: finalItemId });
});
