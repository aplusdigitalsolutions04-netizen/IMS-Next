import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);

  const [rows] = await mysqlPool.query("SELECT * FROM inventorystockin WHERE status = 0 AND isDeleted = 0 AND companyGuid = ? ORDER BY createdAt DESC LIMIT 1", [user.companyId]);
  return NextResponse.json({ data: rows, message: "Success" });
});
