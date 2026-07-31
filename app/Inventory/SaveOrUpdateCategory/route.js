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

  const { CategoryId, CategoryName, ShowMrp } = body;
  const showMrpBit = ShowMrp ? 1 : 0;
  let finalCategoryId = CategoryId;
  if (CategoryId && CategoryId !== "0" && CategoryId !== 0 && CategoryId !== "") {
    await mysqlPool.execute("UPDATE inventorycategorymaster SET categoryName = ?, showMrp = ? WHERE categoryId = ? AND companyGuid = ?", [CategoryName, showMrpBit, CategoryId, user.companyId]);
  } else {
    finalCategoryId = uuidv4();
    await mysqlPool.execute("INSERT INTO inventorycategorymaster (categoryId, companyGuid, categoryName, showMrp) VALUES (?, ?, ?, ?)", [finalCategoryId, user.companyId, CategoryName, showMrpBit]);
  }
  return NextResponse.json({ message: "Success", categoryId: finalCategoryId });
});
