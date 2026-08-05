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

  const [owned] = await mysqlPool.query(
    `SELECT m.mappingId FROM inventorycategorybrandmapping m
     JOIN inventorycategorymaster c ON m.categoryId = c.categoryId AND c.companyGuid = ?
     WHERE m.mappingId = ?`,
    [user.companyId, body.mappingId]
  );
  if (!owned.length) throw new ApiError(404, "Mapping not found");
  await mysqlPool.execute("UPDATE inventorycategorybrandmapping SET isDeleted = 1 WHERE mappingId = ?", [body.mappingId]);
  return NextResponse.json({ message: "Success" });
});
