import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, requireCompany, authorizeMasterRead } from "@/lib/auth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeMasterRead(user, "stat_item");
  requireAuth(user);
  requireCompany(user);

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");
  const page = Number(searchParams.get("page")) || 1;
  const limit = Number(searchParams.get("limit")) || 10;
  const offset = (page - 1) * limit;
  const search = searchParams.get("search");

  const searchClause = search ? "AND v.variantName LIKE ?" : "";
  const searchParam = search ? [`%${search}%`] : [];

  const [[categoryInfo]] = await mysqlPool.query(
    `SELECT IFNULL(c.showMrp, 0) as showMrp, IFNULL(i.isTrackable, 0) as isTrackable, c.categoryId, c.categoryName
     FROM inventoryitemmaster i LEFT JOIN inventorycategorymaster c ON i.categoryId = c.categoryId
     WHERE i.itemId = ? AND i.companyGuid = ?`,
    [itemId, user.companyId]
  );
  const isTrackable = !!categoryInfo?.isTrackable;

  // Trackable variants: live-count Available serials (dispatch/return never
  // update inventoryvariantstock.availablePCS, so it drifts stale for these).
  const [rows] = await mysqlPool.query(
    `SELECT v.itemVariantId, v.variantName as variantCode, v.sellingPrice as mrp,
            COALESCE(NULLIF(s.avgPurchaseRate, 0), v.purchasePrice, 0) as avgPurchaseRate,
            ${isTrackable ? "IFNULL(sc.availableCount, 0)" : "IFNULL(s.availablePCS, 0)"} as availablePCS
     FROM inventoryitemvariant v
     LEFT JOIN inventoryvariantstock s ON v.itemVariantId = s.itemVariantId
     ${isTrackable ? `LEFT JOIN (
       SELECT itemVariantId, COUNT(*) as availableCount FROM inventorystockinserial
       WHERE serialStatus = 'Available' AND isDeleted = 0 GROUP BY itemVariantId
     ) sc ON v.itemVariantId = sc.itemVariantId` : ""}
     WHERE v.itemId = ? AND v.isDeleted = 0 AND v.companyGuid = ? ${searchClause}
     ORDER BY v.variantName ASC
     LIMIT ? OFFSET ?`,
    [itemId, user.companyId, ...searchParam, limit, offset]
  );

  if (rows.length) {
    const variantIds = rows.map((r) => r.itemVariantId);
    // Joined straight to dropdown_master by specificationId — not scoped to
    // this item's own category — so a variant's spec values still resolve to
    // their real name/label after Transfer Variant moves it under an item in
    // a different category. Category Master defines which fields you can
    // EDIT for a given category (see GetCategorySpecificationList), but what
    // a variant already HAS should keep showing regardless of which item it
    // currently sits under, same as its stock/serials already do.
    const [specRows] = await mysqlPool.query(
      `SELECT sv.itemVariantId, sv.specificationId, sv.value, dm.dropdown_name as specName
       FROM inventoryitemvariantspecvalue sv
       LEFT JOIN dropdown_master dm ON sv.specificationId = dm.id
       WHERE sv.itemVariantId IN (?) AND sv.companyGuid = ?`,
      [variantIds, user.companyId]
    );
    const specsByVariant = specRows.reduce((acc, r) => {
      (acc[r.itemVariantId] ||= {})[r.specificationId] = r.value;
      return acc;
    }, {});
    const specDetailsByVariant = specRows.reduce((acc, r) => {
      (acc[r.itemVariantId] ||= []).push({ specificationId: r.specificationId, specName: r.specName || "Spec", value: r.value });
      return acc;
    }, {});
    rows.forEach((r) => {
      r.specs = specsByVariant[r.itemVariantId] || {};
      r.specDetails = specDetailsByVariant[r.itemVariantId] || [];
    });
  }

  const [[{ total }]] = await mysqlPool.query(
    `SELECT COUNT(*) as total FROM inventoryitemvariant v WHERE v.itemId = ? AND v.isDeleted = 0 AND v.companyGuid = ? ${searchClause}`,
    [itemId, user.companyId, ...searchParam]
  );

  return NextResponse.json({
    message: "Success",
    data: rows,
    total,
    showMrp: !!categoryInfo?.showMrp,
    isTrackable,
    categoryId: categoryInfo?.categoryId || "",
    categoryName: categoryInfo?.categoryName || "",
  });
});
