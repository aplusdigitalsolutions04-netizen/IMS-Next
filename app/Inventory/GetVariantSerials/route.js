import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);
  requireCompany(user);

  const { searchParams } = new URL(request.url);
  const itemVariantId = searchParams.get("itemVariantId");
  if (!itemVariantId) {
    return NextResponse.json({ message: "itemVariantId is required" }, { status: 400 });
  }

  // s.landingPrice is unreliable (often left at 0 by the Stock-In finalize
  // flow — see app/api/reports/route.js for the same issue) — fall back to
  // the item's current purchasePrice from Item Master when that happens.
  const [rows] = await mysqlPool.query(
    `SELECT s.guid, s.serialNumber as value, s.serialStatus as status,
       COALESCE(NULLIF(s.landingPrice, 0), iv.purchasePrice, 0) as landingPrice, s.createdAt
     FROM inventorystockinserial s
     LEFT JOIN inventoryitemvariant iv ON s.itemVariantId = iv.itemVariantId AND iv.isDeleted = 0
     WHERE s.itemVariantId = ? AND s.isDeleted = 0 AND s.companyGuid = ?
     ORDER BY s.createdAt DESC`,
    [itemVariantId, user.companyId]
  );

  const [[stockRow]] = await mysqlPool.query(
    "SELECT lastPurchaseRate FROM inventoryvariantstock s JOIN inventoryitemvariant v ON s.itemVariantId = v.itemVariantId WHERE s.itemVariantId = ? AND v.companyGuid = ?",
    [itemVariantId, user.companyId]
  );

  return NextResponse.json({ data: rows, total: rows.length, lastPurchaseRate: stockRow?.lastPurchaseRate || 0, message: "Success" });
});
