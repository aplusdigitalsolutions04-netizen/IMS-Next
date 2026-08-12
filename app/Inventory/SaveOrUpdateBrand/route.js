import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, authorizeMasterWrite } from "@/lib/auth";
import { syncBrandInCompanyDropdown } from "@/lib/inventoryBrandDropdownSync";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireAuth(user);
  requireCompany(user);

  const { BrandId, BrandName, ShowInModels } = body;
  const showInModels = ShowInModels ? 1 : 0;
  let finalBrandId = BrandId;
  const isCreate = !(BrandId && BrandId !== "0" && BrandId !== "");
  authorizeMasterWrite(user, "brand", { isCreate });
  if (BrandId && BrandId !== "0" && BrandId !== "") {
    await mysqlPool.execute("UPDATE inventorybrandmaster SET brandName = ?, showInModels = ? WHERE brandId = ? AND companyGuid = ?", [BrandName, showInModels, BrandId, user.companyId]);
  } else {
    finalBrandId = uuidv4();
    await mysqlPool.execute("INSERT INTO inventorybrandmaster (brandId, companyGuid, brandName, showInModels) VALUES (?, ?, ?, ?)", [finalBrandId, user.companyId, BrandName, showInModels]);
  }
  await syncBrandInCompanyDropdown(mysqlPool, BrandName, !!showInModels);
  return NextResponse.json({ message: "Success", brandId: finalBrandId });
});
