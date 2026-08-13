import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Cross-cutting item lookup for screens that need to find existing items by
// category/brand (e.g. the Contracts "link to existing item" wizard) without
// requiring "Item Master" permission. Both filters are optional.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);
  requireCompany(user);

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");
  const brandId = searchParams.get("brandId");

  const conditions = ["i.isDeleted = 0", "i.companyGuid = ?"];
  const params = [user.companyId];
  if (categoryId) { conditions.push("i.categoryId = ?"); params.push(categoryId); }
  if (brandId) { conditions.push("i.brandId = ?"); params.push(brandId); }

  const [rows] = await mysqlPool.query(
    `SELECT i.itemId, i.itemName, i.categoryId, i.brandId FROM inventoryitemmaster i WHERE ${conditions.join(" AND ")} ORDER BY i.itemName ASC`,
    params
  );
  return NextResponse.json({ data: rows, message: "Success" });
});
