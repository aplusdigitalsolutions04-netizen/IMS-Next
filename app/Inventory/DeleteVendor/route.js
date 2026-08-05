import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);

  const { vendorId } = body;
  await mysqlPool.execute("UPDATE inventoryvendor SET isDeleted = 1 WHERE vendorId = ? AND companyGuid = ?", [vendorId, user.companyId]);
  return NextResponse.json({ message: "Success" });
});
