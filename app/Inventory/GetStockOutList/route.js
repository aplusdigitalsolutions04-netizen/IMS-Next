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
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const page = parseInt(searchParams.get("page")) || 1;
  const limit = parseInt(searchParams.get("limit")) || 10;
  const offset = (page - 1) * limit;

  let filterSql = "WHERE o.isDeleted = 0 AND o.companyGuid = ?";
  const filterParams = [user.companyId];
  if (startDate && endDate) {
    filterSql += " AND o.issueDate BETWEEN ? AND ?";
    filterParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
  }

  const [countRows] = await mysqlPool.query(`SELECT COUNT(*) as total FROM inventorystockout o ${filterSql}`, filterParams);
  const totalRecords = countRows[0].total;

  const query = `
    SELECT o.*, d.issueQty, d.sellingPrice, v.variantName as variantCode, i.itemName
    FROM inventorystockout o
    JOIN inventorystockoutdetail d ON o.stockOutId = d.stockOutId
    JOIN inventoryitemvariant v ON d.itemVariantId = v.itemVariantId
    JOIN inventoryitemmaster i ON v.itemId = i.itemId
    ${filterSql}
    ORDER BY o.issueDate DESC
    LIMIT ? OFFSET ?
  `;
  const params = [...filterParams, limit, offset];

  const [rows] = await mysqlPool.query(query, params);
  return NextResponse.json({ data: rows, total: totalRecords, page, limit, message: "Success" });
});
