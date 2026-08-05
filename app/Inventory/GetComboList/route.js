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
  const limit = parseInt(searchParams.get("limit")) || 10;
  const offset = (page - 1) * limit;

  const [countRows] = await mysqlPool.query(`
    SELECT COUNT(DISTINCT m.parentVariantId) as total
    FROM inventorycombomapping m
    JOIN inventoryitemvariant pv ON m.parentVariantId = pv.itemVariantId AND pv.companyGuid = ?
    WHERE m.isDeleted = 0
  `, [user.companyId]);

  const [rows] = await mysqlPool.query(`
    SELECT m.parentVariantId as itemVariantId, pv.variantName as variantCode, pi.itemName, COUNT(m.childVariantId) as componentCount
    FROM inventorycombomapping m
    JOIN inventoryitemvariant pv ON m.parentVariantId = pv.itemVariantId AND pv.companyGuid = ?
    JOIN inventoryitemmaster pi ON pv.itemId = pi.itemId
    WHERE m.isDeleted = 0
    GROUP BY m.parentVariantId
    LIMIT ? OFFSET ?
  `, [user.companyId, limit, offset]);

  return NextResponse.json({ data: rows, total: countRows[0].total, message: "Success" });
});
