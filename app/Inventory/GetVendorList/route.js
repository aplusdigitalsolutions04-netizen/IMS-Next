import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page")) || 1;
  const limit = parseInt(searchParams.get("limit")) || 1000;
  const offset = (page - 1) * limit;

  const [countRows] = await mysqlPool.query("SELECT COUNT(*) as total FROM inventoryvendor WHERE isDeleted = 0 AND companyGuid = ?", [user.companyId]);
  const [rows] = await mysqlPool.query("SELECT * FROM inventoryvendor WHERE isDeleted = 0 AND companyGuid = ? LIMIT ? OFFSET ?", [user.companyId, limit, offset]);
  return NextResponse.json({ data: rows, total: countRows[0].total, message: "Success" });
});
