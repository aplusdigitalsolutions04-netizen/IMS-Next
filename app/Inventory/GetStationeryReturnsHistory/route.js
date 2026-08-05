import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);

  const [rows] = await mysqlPool.query(`
    SELECT
      r.*,
      COALESCE(o.issuedBy, 'Legacy/Bulk') as customerName,
      'Internal' as firmName,
      o.issueDate as dispatchDate
    FROM inventorystationeryreturns r
    LEFT JOIN inventorystockout o ON r.stockOutId = o.stockOutId
    WHERE r.isDeleted = 0 AND r.companyGuid = ?
    ORDER BY r.createdAt DESC
  `, [user.companyId]);
  return NextResponse.json({ data: rows });
});
