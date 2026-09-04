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

  // Deleting an item (DeleteItem route) only soft-deletes the item row
  // itself — its variants keep isDeleted = 0 — so this must exclude
  // deleted items explicitly, not just rely on the variant's own flag.
  let whereClause = "WHERE v.isDeleted = 0 AND i.isDeleted = 0 AND v.companyGuid = ? AND EXISTS (SELECT 1 FROM companies WHERE guid = v.companyGuid AND isActive = 1) AND i.itemName != 'SYSTEM_COMBOS' AND v.itemVariantId NOT IN (SELECT parentVariantId FROM inventorycombomapping WHERE isDeleted = 0)";
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
  // (the real per-unit cost). When stock is 0 there's no Available serial to
  // average, so fall back to `lk`: the landingPrice of the single MOST
  // RECENT serial for that variant regardless of status — i.e. the last
  // price paid even if every unit since sold out. That's what Item Master's
  // own "Add Serial" history shows (it lists serials of every status), so
  // this keeps Current Stock's out-of-stock rows consistent with it instead
  // of going straight to blank/0. inventoryvariantstock's
  // lastPurchaseRate/avgPurchaseRate and finally the variant's own
  // purchasePrice from Item Master are further fallbacks after that.
  // Multiplying by availablePCS=0 still keeps totalValue at 0 for
  // out-of-stock rows, so none of this affects inventory valuation — only
  // the price display.
  const priceExpr = "IFNULL(NULLIF(lp.avgLandingPrice, 0), IFNULL(NULLIF(lk.lastLandingPrice, 0), IFNULL(NULLIF(s.lastPurchaseRate, 0), IFNULL(NULLIF(s.avgPurchaseRate, 0), IFNULL(v.purchasePrice, 0)))))";
  // Picks exactly one serial per itemVariantId — a plain "join to the max
  // createdAt" (what this used to do) can match MORE than one row when
  // several serials share the exact same createdAt (e.g. a batch/bulk
  // import inserts them all with one timestamp), which fans the whole
  // result set out into duplicate rows. The guid tiebreaker in the
  // correlated subquery guarantees a single row even when timestamps tie.
  const lastKnownJoin = `
    LEFT JOIN (
      SELECT s1.itemVariantId, s1.landingPrice as lastLandingPrice
      FROM inventorystockinserial s1
      WHERE s1.isDeleted = 0
        AND s1.guid = (
          SELECT s2.guid FROM inventorystockinserial s2
          WHERE s2.itemVariantId = s1.itemVariantId AND s2.isDeleted = 0
          ORDER BY s2.createdAt DESC, s2.guid DESC
          LIMIT 1
        )
    ) lk ON v.itemVariantId = lk.itemVariantId`;

  const [rows] = await mysqlPool.query(`
    SELECT v.itemVariantId, v.variantName, i.itemName, i.brandId, u.unitName, i.isTrackable,
           cat.categoryName, br.brandName,
           IF(i.isTrackable, IFNULL(sc.availableCount, 0), IFNULL(s.availablePCS, 0)) as availablePCS,
           ${priceExpr} as avgPurchaseRate,
           (IF(i.isTrackable, IFNULL(sc.availableCount, 0), IFNULL(s.availablePCS, 0)) * ${priceExpr}) as totalValue
    FROM inventoryitemvariant v
    JOIN inventoryitemmaster i ON v.itemId = i.itemId
    LEFT JOIN inventoryunitmaster u ON i.unitId = u.unitId
    LEFT JOIN inventorycategorymaster cat ON i.categoryId = cat.categoryId
    LEFT JOIN inventorybrandmaster br ON i.brandId = br.brandId
    LEFT JOIN inventoryvariantstock s ON v.itemVariantId = s.itemVariantId
    LEFT JOIN (
      SELECT itemVariantId, COUNT(*) as availableCount FROM inventorystockinserial
      WHERE serialStatus = 'Available' AND isDeleted = 0 GROUP BY itemVariantId
    ) sc ON v.itemVariantId = sc.itemVariantId
    LEFT JOIN (
      SELECT itemVariantId, AVG(NULLIF(landingPrice, 0)) as avgLandingPrice FROM inventorystockinserial
      WHERE serialStatus = 'Available' AND isDeleted = 0 GROUP BY itemVariantId
    ) lp ON v.itemVariantId = lp.itemVariantId
    ${lastKnownJoin}
    ${whereClause}
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  const [[{ total, totalValue, totalQty, lowStockCount }]] = await mysqlPool.query(`
    SELECT
      COUNT(*) as total,
      SUM(IF(i.isTrackable, IFNULL(sc.availableCount, 0), IFNULL(s.availablePCS, 0)) * ${priceExpr}) as totalValue,
      SUM(IF(i.isTrackable, IFNULL(sc.availableCount, 0), IFNULL(s.availablePCS, 0))) as totalQty,
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
    ${lastKnownJoin}
    ${whereClause}
  `, params);

  return NextResponse.json({
    data: rows,
    total,
    totalValue: totalValue || 0,
    totalQty: totalQty || 0,
    lowStockCount: lowStockCount || 0,
    message: "Success",
  });
});
