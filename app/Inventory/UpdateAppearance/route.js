import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Appearance update for Stock In / Stock Out / Stationery Return.
export const PUT = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "PUT");
  requireAuth(user);

  const { type, id, rowColor, tags } = body;

  const table = type === "in" ? "inventorystockin" : type === "stationery_return" ? "inventorystationeryreturns" : "inventorystockout";
  const idColumn = type === "in" ? "stockInId" : type === "stationery_return" ? "returnId" : "stockOutId";

  const [result] = await mysqlPool.query(`UPDATE ${table} SET rowColor = ?, tags = ? WHERE ${idColumn} = ? AND companyGuid = ?`, [rowColor || null, tags || null, id, user.companyId]);
  if (result.affectedRows === 0) throw new ApiError(404, "Record not found");

  return NextResponse.json({ message: "Appearance updated successfully" });
});
