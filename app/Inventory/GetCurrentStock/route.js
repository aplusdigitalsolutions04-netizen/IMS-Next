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
  const page = Number(searchParams.get("page")) || 1;
  const limit = Number(searchParams.get("limit")) || 10;
  const brandId = searchParams.get("brandId");
  const search = searchParams.get("search");
  const offset = (page - 1) * limit;

  let whereClause = "WHERE v.isDeleted = 0 AND v.companyGuid = ? AND EXISTS (SELECT 1 FROM companies WHERE guid = v.companyGuid AND isActive = 1) AND i.itemName != 'SYSTEM_COMBOS' AND v.itemVariantId NOT IN (SELECT parentVariantId FROM inventorycombomapping WHERE isDeleted = 0)";
  const params = [user.companyId];

  if (brandId && brandId !== "all") {
    whereClause += " AND i.brandId = ?";
    params.push(brandId);
  }

  if (search) {
    whereClause += " AND (i.itemName LIKE ? OR v.variantName LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  // For trackable (serialized) variants, availablePCS in inventoryvariantstock
  // is only ever incremented (Stock In, Add Serial No.) — dispatch/return only
  // flip serials.status and never touch it, so it drifts stale/inflated over
  // time. Live-count Available serials instead for those; non-trackable
  // variants keep using inventoryvariantstock.availablePCS, which dispatch's
  // non-serialized path does keep in sync.
  // "Purchase Rate" here now shows Landing Price — for trackable variants
  // that's the average landingPrice across their currently-Available serials
  // (the real per-unit cost), falling back to inventoryvariantstock's
  // lastPurchaseRate/avgPurchaseRate only when no serial landingPrice exists
  // (e.g. non-trackable variants, which never get serial rows at all).
  const [rows] = await mysqlPool.query(`
    SELECT v.itemVariantId, v.variantName, i.itemName, i.brandId, u.unitName, i.isTrackable,
           IF(i.isTrackable, IFNULL(sc.availableCount, 0), IFNULL(s.availablePCS, 0)) as availablePCS,
           IFNULL(NULLIF(lp.avgLandingPrice, 0), IFNULL(NULLIF(s.lastPurchaseRate, 0), IFNULL(s.avgPurchaseRate, 0))) as avgPurchaseRate,
           (IF(i.isTrackable, IFNULL(sc.availableCount, 0), IFNULL(s.availablePCS, 0)) * IFNULL(NULLIF(lp.avgLandingPrice, 0), IFNULL(NULLIF(s.lastPurchaseRate, 0), IFNULL(s.avgPurchaseRate, 0)))) as totalValue
    FROM inventoryitemvariant v
    JOIN inventoryitemmaster i ON v.itemId = i.itemId
    LEFT JOIN inventoryunitmaster u ON i.unitId = u.unitId
    LEFT JOIN inventoryvariantstock s ON v.itemVariantId = s.itemVariantId
    LEFT JOIN (
      SELECT itemVariantId, COUNT(*) as availableCount FROM inventorystockinserial
      WHERE serialStatus = 'Available' AND isDeleted = 0 GROUP BY itemVariantId
    ) sc ON v.itemVariantId = sc.itemVariantId
    LEFT JOIN (
      SELECT itemVariantId, AVG(NULLIF(landingPrice, 0)) as avgLandingPrice FROM inventorystockinserial
      WHERE serialStatus = 'Available' AND isDeleted = 0 GROUP BY itemVariantId
    ) lp ON v.itemVariantId = lp.itemVariantId
    ${whereClause}
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  const [[{ total, totalValue, lowStockCount }]] = await mysqlPool.query(`
    SELECT
      COUNT(*) as total,
      SUM(IF(i.isTrackable, IFNULL(sc.availableCount, 0), IFNULL(s.availablePCS, 0)) * IFNULL(NULLIF(lp.avgLandingPrice, 0), IFNULL(NULLIF(s.lastPurchaseRate, 0), IFNULL(s.avgPurchaseRate, 0)))) as totalValue,
      COUNT(CASE WHEN IF(i.isTrackable, IFNULL(sc.availableCount, 0), IFNULL(s.availablePCS, 0)) < 10 THEN 1 END) as lowStockCount
    FROM inventoryitemvariant v
    JOIN inventoryitemmaster i ON v.itemId = i.itemId
    LEFT JOIN inventoryvariantstock s ON v.itemVariantId = s.itemVariantId
    LEFT JOIN (
      SELECT itemVariantId, COUNT(*) as availableCount FROM inventorystockinserial
      WHERE serialStatus = 'Available' AND isDeleted = 0 GROUP BY itemVariantId
    ) sc ON v.itemVariantId = sc.itemVariantId
    LEFT JOIN (
      SELECT itemVariantId, AVG(NULLIF(landingPrice, 0)) as avgLandingPrice FROM inventorystockinserial
      WHERE serialStatus = 'Available' AND isDeleted = 0 GROUP BY itemVariantId
    ) lp ON v.itemVariantId = lp.itemVariantId
    ${whereClause}
  `, params);

  return NextResponse.json({
    data: rows,
    total,
    totalValue: totalValue || 0,
    lowStockCount: lowStockCount || 0,
    message: "Success",
  });
});
