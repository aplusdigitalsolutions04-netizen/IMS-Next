import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);

  const { parentVariantId } = body;
  const [owned] = await mysqlPool.query("SELECT itemVariantId FROM inventoryitemvariant WHERE itemVariantId = ? AND companyGuid = ?", [parentVariantId, user.companyId]);
  if (!owned.length) throw new ApiError(404, "Combo not found");
  await mysqlPool.execute("UPDATE inventorycombomapping SET isDeleted = 1 WHERE parentVariantId = ?", [parentVariantId]);
  return NextResponse.json({ message: "Success" });
});
