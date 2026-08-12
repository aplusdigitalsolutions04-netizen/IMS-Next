import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, authorizeMasterDelete } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeMasterDelete(user, "brand");
  requireAuth(user);

  const { brandId } = body;
  await mysqlPool.execute("UPDATE inventorybrandmaster SET isDeleted = 1 WHERE brandId = ? AND companyGuid = ?", [brandId, user.companyId]);
  return NextResponse.json({ message: "Success" });
});
