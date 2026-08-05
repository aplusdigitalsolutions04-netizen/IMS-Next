import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);

  // Same page/limit convention as GetVendorList and friends. Callers that
  // need the complete cross-reference list for local matching (the mapping
  // list page, AddProductWizard's duplicate check) pass an explicit high
  // limit rather than relying on an unbounded default — the endpoint itself
  // no longer silently returns everything with no cap.
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page")) || 1;
  const limit = parseInt(searchParams.get("limit")) || 100;
  const offset = (page - 1) * limit;

  const [countRows] = await mysqlPool.query(`
    SELECT COUNT(*) as total
    FROM inventorycategorybrandmapping m
    JOIN inventorycategorymaster c ON m.categoryId = c.categoryId AND c.companyGuid = ?
    JOIN inventorybrandmaster b ON m.brandId = b.brandId AND b.companyGuid = ?
    WHERE m.isDeleted = 0
  `, [user.companyId, user.companyId]);

  const [rows] = await mysqlPool.query(`
    SELECT m.mappingId, c.categoryName, b.brandName, m.categoryId, m.brandId
    FROM inventorycategorybrandmapping m
    JOIN inventorycategorymaster c ON m.categoryId = c.categoryId AND c.companyGuid = ?
    JOIN inventorybrandmaster b ON m.brandId = b.brandId AND b.companyGuid = ?
    WHERE m.isDeleted = 0
    LIMIT ? OFFSET ?
  `, [user.companyId, user.companyId, limit, offset]);

  return NextResponse.json({ data: rows, total: countRows[0].total, page, limit, message: "Success" });
});
