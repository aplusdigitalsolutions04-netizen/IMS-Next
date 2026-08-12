import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, authorizeMasterDelete } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeMasterDelete(user, "unit");
  requireAuth(user);

  const { unitId } = body;
  await mysqlPool.execute("UPDATE inventoryunitmaster SET isDeleted = 1 WHERE unitId = ?", [unitId]);
  return NextResponse.json({ message: "Success" });
});
