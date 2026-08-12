import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, authorizeMasterDelete } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeMasterDelete(user, "item");
  requireAuth(user);

  const { itemVariantId } = body;
  await mysqlPool.execute("UPDATE inventoryitemvariant SET isDeleted = 1 WHERE itemVariantId = ? AND companyGuid = ?", [itemVariantId, user.companyId]);
  return NextResponse.json({ message: "Success" });
});
