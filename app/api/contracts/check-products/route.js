import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

// Called right after a contract is saved — checks each product on the
// contract against Item Master (matched by variant name, case/whitespace
// insensitive) so the UI can prompt to create whatever isn't there yet.
export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeInventory(user, "POST");
  requireAuth(user);
  requireCompany(user);

  const productNames = Array.isArray(body.productNames) ? body.productNames.filter((n) => String(n || "").trim()) : [];
  if (productNames.length === 0) return NextResponse.json({ data: [] });

  const [rows] = await mysqlPool.query(
    `SELECT v.itemVariantId, v.itemId, v.variantName
     FROM inventoryitemvariant v
     WHERE v.isDeleted = 0 AND v.companyGuid = ?`,
    [user.companyId]
  );
  const byName = new Map(rows.map((r) => [String(r.variantName || "").trim().toLowerCase(), r]));

  const data = productNames.map((name) => {
    const match = byName.get(String(name).trim().toLowerCase());
    return {
      productName: name,
      exists: !!match,
      itemVariantId: match?.itemVariantId || null,
      itemId: match?.itemId || null,
    };
  });

  return NextResponse.json({ data });
});
