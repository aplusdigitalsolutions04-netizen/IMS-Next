import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, authorizeMasterRead } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterRead(user, "stat_item");
  requireAuth(user);
  requireCompany(user);

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page")) || 1;
  const limit = parseInt(searchParams.get("limit")) || 1000;
  const offset = (page - 1) * limit;
  const categoryId = searchParams.get("categoryId");

  const whereCategory = categoryId ? "AND i.categoryId = ?" : "";
  const countParams = [user.companyId, ...(categoryId ? [categoryId] : [])];

  const [countRows] = await mysqlPool.query(
    `SELECT COUNT(*) as total FROM inventoryitemmaster i WHERE i.isDeleted = 0 AND i.companyGuid = ? ${whereCategory}`,
    countParams
  );
  const [rows] = await mysqlPool.query(`
    SELECT i.*, c.categoryName, b.brandName, u.unitName
    FROM inventoryitemmaster i
    LEFT JOIN inventorycategorymaster c ON i.categoryId = c.categoryId
    LEFT JOIN inventorybrandmaster b ON i.brandId = b.brandId
    LEFT JOIN inventoryunitmaster u ON i.unitId = u.unitId
    WHERE i.isDeleted = 0 AND i.companyGuid = ? ${whereCategory}
    ORDER BY c.categoryName ASC, i.itemName ASC
    LIMIT ? OFFSET ?
  `, [...countParams, limit, offset]);
  return NextResponse.json({ data: rows, total: countRows[0].total, message: "Success" });
});
