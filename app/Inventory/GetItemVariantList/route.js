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
     LIMIT ? OFFSET ?`,
    [itemId, user.companyId, ...searchParam, limit, offset]
  );

  if (rows.length) {
    const variantIds = rows.map((r) => r.itemVariantId);
    const [specRows] = await mysqlPool.query(
      `SELECT itemVariantId, specificationId, value
       FROM inventoryitemvariantspecvalue
       WHERE itemVariantId IN (?) AND companyGuid = ?`,
      [variantIds, user.companyId]
    );
    const specsByVariant = specRows.reduce((acc, r) => {
      (acc[r.itemVariantId] ||= {})[r.specificationId] = r.value;
      return acc;
    }, {});
    rows.forEach((r) => {
      r.specs = specsByVariant[r.itemVariantId] || {};
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
