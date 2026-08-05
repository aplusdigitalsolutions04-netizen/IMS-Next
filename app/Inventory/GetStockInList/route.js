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
  const status = searchParams.get("status");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const page = parseInt(searchParams.get("page")) || 1;
  const limit = parseInt(searchParams.get("limit")) || 10;
  const offset = (page - 1) * limit;

  let filterSql = "WHERE s.status = ? AND s.isDeleted = 0 AND s.companyGuid = ?";
  const filterParams = [status, user.companyId];
  if (startDate && endDate) {
    filterSql += " AND s.invoiceDate BETWEEN ? AND ?";
    filterParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
  }

  const [countRows] = await mysqlPool.query(`SELECT COUNT(*) as total FROM inventorystockin s ${filterSql}`, filterParams);
  const totalRecords = countRows[0].total;

  const query = `
    SELECT s.*, v.vendorFirmName as vendorName,
           IFNULL(SUM(d.stockInQty), 0) as totalQty,
           IFNULL(SUM(d.stockInQty * d.purchaseRate), 0) as totalAmount,
           GROUP_CONCAT(DISTINCT COALESCE(i.itemName, fbiv.variantName, mim.variantName) SEPARATOR ', ') as itemNames,
           COUNT(DISTINCT d.stockInDetailId) as itemTypeCount
    FROM inventorystockin s
    LEFT JOIN inventoryvendor v ON s.vendorId = v.vendorId
    LEFT JOIN inventorystockindetail d ON s.stockInId = d.stockInId AND d.isDeleted = 0
    LEFT JOIN inventoryitemvariant iv ON d.itemVariantId = iv.itemVariantId
    LEFT JOIN inventoryitemmaster i ON iv.itemId = i.itemId
    LEFT JOIN inventoryitemvariant fbiv ON d.modelGuid = fbiv.itemVariantId
    LEFT JOIN model_itemvariant_map map ON d.modelGuid COLLATE utf8mb4_unicode_ci = map.modelGuid COLLATE utf8mb4_unicode_ci
    LEFT JOIN inventoryitemvariant mim ON map.itemVariantId COLLATE utf8mb4_unicode_ci = mim.itemVariantId COLLATE utf8mb4_unicode_ci
    ${filterSql}
    GROUP BY s.stockInId
    ORDER BY s.invoiceDate DESC
    LIMIT ? OFFSET ?
  `;
  const params = [...filterParams, limit, offset];

  const [rows] = await mysqlPool.query(query, params);
  return NextResponse.json({ data: rows, total: totalRecords, page, limit, message: "Success" });
});
