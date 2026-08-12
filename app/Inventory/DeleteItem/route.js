import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, authorizeMasterDelete } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeMasterDelete(user, "item");
  requireAuth(user);

  await mysqlPool.execute("UPDATE inventoryitemmaster SET isDeleted = 1 WHERE itemId = ? AND companyGuid = ?", [body.itemId, user.companyId]);
  return NextResponse.json({ message: "Success" });
});
