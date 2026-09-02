import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Row-per-serial version of GetCurrentStock, for the "Export All Stock"
// button — GetCurrentStock only returns one aggregated row per variant (and
// only the current page), so the Excel export could never show individual
// serial numbers. Trackable variants get one row per Available serial (with
// that serial's own landing price); non-trackable variants keep one summary
// row each (serialNumber left blank — there's nothing per-unit to list).
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);
  requireCompany(user);

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  const search = searchParams.get("search");

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

  const [rows] = await mysqlPool.query(
    `SELECT v.itemVariantId, v.variantName, i.itemName, i.itemCode as sku, u.unitName, i.isTrackable,
       s.serialNumber, s.landingPrice as serialLandingPrice,
       IFNULL(vs.avgPurchaseRate, 0) as variantAvgPurchaseRate, IFNULL(vs.availablePCS, 0) as variantAvailablePCS,
       v.purchasePrice as itemPurchasePrice, lk.lastLandingPrice
     FROM inventoryitemvariant v
     JOIN inventoryitemmaster i ON v.itemId = i.itemId
     LEFT JOIN inventoryunitmaster u ON i.unitId = u.unitId
     LEFT JOIN inventoryvariantstock vs ON v.itemVariantId = vs.itemVariantId
     LEFT JOIN inventorystockinserial s ON s.itemVariantId = v.itemVariantId AND s.serialStatus = 'Available' AND s.isDeleted = 0 AND i.isTrackable = 1
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
     ) lk ON v.itemVariantId = lk.itemVariantId
     ${whereClause}
     ORDER BY i.itemName, v.variantName, s.createdAt`,
    params
  );

  const data = rows.map((r) => {
    // A trackable variant with 0 stock has no Available serial to pull a
    // landingPrice from — fall back to the last serial's price regardless of
    // status (matches Item Master's "Add Serial" history, which lists every
    // status), then to inventoryvariantstock's avgPurchaseRate, then to
    // Item Master's own purchasePrice, so out-of-stock rows still show a
    // price instead of blank/0 (qty stays 0 either way, so this doesn't
    // affect totalValue for those rows).
    const landingPrice = r.isTrackable
      ? (Number(r.serialLandingPrice) || Number(r.lastLandingPrice) || Number(r.variantAvgPurchaseRate) || Number(r.itemPurchasePrice) || 0)
      : (Number(r.variantAvgPurchaseRate) || Number(r.itemPurchasePrice) || 0);
    const qty = r.isTrackable ? (r.serialNumber ? 1 : 0) : (Number(r.variantAvailablePCS) || 0);
    return {
      itemName: r.itemName,
      variantName: r.variantName,
      sku: r.sku || "N/A",
      serialNumber: r.serialNumber || "",
      availableQty: qty,
      landingPrice,
      totalValue: qty * landingPrice,
    };
  });

  return NextResponse.json({ data, message: "Success" });
});
