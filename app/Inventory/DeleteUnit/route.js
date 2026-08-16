import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, authorizeMasterDelete } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeMasterDelete(user, "unit");
  requireAuth(user);
  requireCompany(user);

  const { unitId } = body;
  await mysqlPool.execute("UPDATE inventoryunitmaster SET isDeleted = 1 WHERE unitId = ? AND companyGuid = ?", [unitId, user.companyId]);
  return NextResponse.json({ message: "Success" });
});
