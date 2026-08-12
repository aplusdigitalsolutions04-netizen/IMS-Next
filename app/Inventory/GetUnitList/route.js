import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, authorizeMasterRead } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterRead(user, "stat_unit");
  requireAuth(user);

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page")) || 1;
  const limit = parseInt(searchParams.get("limit")) || 1000;
  const offset = (page - 1) * limit;

  const [countRows] = await mysqlPool.query("SELECT COUNT(*) as total FROM inventoryunitmaster WHERE isDeleted = 0");
  const [rows] = await mysqlPool.query("SELECT unitId, unitName, unitDesc as unitDescription, baseUnitQty FROM inventoryunitmaster WHERE isDeleted = 0 LIMIT ? OFFSET ?", [limit, offset]);
  return NextResponse.json({ data: rows, total: countRows[0].total, message: "Success" });
});
