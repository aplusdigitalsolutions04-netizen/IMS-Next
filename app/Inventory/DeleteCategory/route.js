import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, authorizeMasterDelete } from "@/lib/auth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeMasterDelete(user, "category");
  requireAuth(user);

  const { categoryId } = body;
  await mysqlPool.execute("UPDATE inventorycategorymaster SET isDeleted = 1 WHERE categoryId = ? AND companyGuid = ?", [categoryId, user.companyId]);
  return NextResponse.json({ message: "Success" });
});
