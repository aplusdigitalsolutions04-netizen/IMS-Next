import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Cross-cutting existence check ("does this category+brand already have a
// mapping row?") used by the Contracts wizard before creating a new item —
// deliberately NOT the full mapping list (that stays gated by stat_mapping
// on GetCategoryBrandMappingList), just a boolean.
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");
  const brandId = searchParams.get("brandId");
  if (!categoryId || !brandId) return NextResponse.json({ exists: false });

  const [rows] = await mysqlPool.query(
    "SELECT mappingId FROM inventorycategorybrandmapping WHERE categoryId = ? AND brandId = ? AND isDeleted = 0 LIMIT 1",
    [categoryId, brandId]
  );
  return NextResponse.json({ exists: rows.length > 0 });
});
