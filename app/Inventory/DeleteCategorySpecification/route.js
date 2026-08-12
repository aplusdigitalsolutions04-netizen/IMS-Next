import { NextResponse } from "next/server";
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

  const { specificationId } = body;
  await mysqlPool.execute(
    "UPDATE dropdown_master SET is_active = 0 WHERE id = ? AND companyGuid = ?",
    [specificationId, user.companyId]
  );
  await mysqlPool.execute(
    "UPDATE dropdown_option SET is_active = 0 WHERE dropdown_id = ?",
    [specificationId]
  );
  return NextResponse.json({ message: "Success" });
});
