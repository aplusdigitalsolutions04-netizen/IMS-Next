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

  const { UnitId, UnitName, UnitDesc, BaseUnitQty } = body;
  let finalUnitId = UnitId;
  const isCreate = !(UnitId && UnitId !== "0" && UnitId !== "");
  authorizeMasterWrite(user, "unit", { isCreate });
  if (UnitId && UnitId !== "0" && UnitId !== "") {
    await mysqlPool.execute("UPDATE inventoryunitmaster SET unitName = ?, unitDesc = ?, baseUnitQty = ? WHERE unitId = ? AND companyGuid = ?", [UnitName, UnitDesc, BaseUnitQty, UnitId, user.companyId]);
  } else {
    finalUnitId = uuidv4();
    await mysqlPool.execute("INSERT INTO inventoryunitmaster (unitId, unitName, unitDesc, baseUnitQty, companyGuid) VALUES (?, ?, ?, ?, ?)", [finalUnitId, UnitName, UnitDesc, BaseUnitQty, user.companyId]);
  }
  return NextResponse.json({ message: "Success", unitId: finalUnitId });
});
