import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, resolveScopedCompanyGuid } from "@/lib/auth";
import { authorizeReports } from "@/lib/reportsAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeReports(user, "GET");
  requireCompany(user);

  // Every query below previously had no companyGuid filter at all — it
  // scanned every tenant's rows and merged them together, so switching the
  // active company never actually changed what Reports showed. `companyGuid`
  // is null only for Admin explicitly requesting the "All Companies" view
  // (see resolveScopedCompanyGuid) — everyone else always gets scoped.
  const companyGuid = resolveScopedCompanyGuid(user, request);
  const companyClause = (alias) => (companyGuid ? ` AND ${alias}.companyGuid = ?` : "");
  const companyParam = companyGuid ? [companyGuid] : [];

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const sDate = startDate ? startDate.split("T")[0] : null;
  const eDate = endDate ? endDate.split("T")[0] : null;

  const buildWhere = (base, col, prefix, companyAlias) => {
    const params = [...companyParam];
    let w = base + companyClause(companyAlias);
    if (sDate && eDate) { w += ` AND ${col} BETWEEN ? AND ?`; params.push(`${prefix ? sDate + " 00:00:00" : sDate}`, `${prefix ? eDate + " 23:59:59" : eDate}`); }
    return { w, params };
  };

  const s1 = buildWhere(" WHERE s.isDeleted=0", "s.invoiceDate", false, "s");
  const [stationeryRows] = await mysqlPool.query(`
    SELECT s.stockInId as _id, s.invoiceNo as orderId, s.invoiceDate as dispatchDate,
           'Stock In' as status, IF(s.status=1,'Finalized','Draft') as logisticsStatus,
           0 as sellingPrice, SUM(d.purchaseRate*d.stockInQty*d.defaultPcsQty) as landingPrice,
           v.vendorFirmName as firmName, 'Inventory Inward' as customerName,
           GROUP_CONCAT(DISTINCT IFNULL(i.itemName,mim.variantName) SEPARATOR ', ') as modelName,
           'NA' as serialValue, 'Stationery' as category, s.invoiceFile
    FROM inventorystockin s
    JOIN inventorystockindetail d ON s.stockInId=d.stockInId
    LEFT JOIN inventoryvendor v ON s.vendorId=v.vendorId
    LEFT JOIN inventoryitemvariant iv ON d.itemVariantId=iv.itemVariantId
    LEFT JOIN inventoryitemmaster i ON iv.itemId=i.itemId
    LEFT JOIN model_itemvariant_map map ON d.modelGuid COLLATE utf8mb4_unicode_ci = map.modelGuid COLLATE utf8mb4_unicode_ci
    LEFT JOIN inventoryitemvariant mim ON map.itemVariantId COLLATE utf8mb4_unicode_ci = mim.itemVariantId COLLATE utf8mb4_unicode_ci
    ${s1.w} GROUP BY s.stockInId,v.vendorFirmName,s.invoiceNo,s.invoiceDate,s.status,s.invoiceFile
  `, s1.params);

  const s2 = buildWhere(" WHERE o.isDeleted=0", "o.dispatchDate", true, "o");
  // sellingPrice/landingPrice are per-unit; serialized rows are always
  // quantity 1 (one row per serial) but non-serialized rows collapse
  // multiple units into a single row, so both must be scaled by quantity to
  // report this row's actual line value rather than its unit price.
  const [printerRows] = await mysqlPool.query(`
    SELECT oi.guid as _id, o.invoiceNumber as orderId, o.dispatchDate,
           o.status, ol.logisticsStatus, oi.sellingPrice * COALESCE(oi.quantity, 1) as sellingPrice,
           COALESCE(NULLIF(s.landingPrice,0), itv.purchasePrice, 0) * COALESCE(oi.quantity, 1) as landingPrice,
           o.platform AS firmName, o.orderid AS customerName, itv.variantName as modelName, s.serialNumber as serialValue,
           'Printers' as category, o.invoiceFilename as invoiceFile, o.ewayBillFilename as ewayBillFile,
           -- commission/packagingCost/freightCharges are all stored once per
           -- order, but the Reports UI groups by order and SUMS each of
           -- these columns across every item row in that order — dividing
           -- by the order's item count here means the sum reconstructs the
           -- true order-level total instead of multiplying it by however
           -- many items the order has. commission used to skip this (it was
           -- summed raw), so a 5-item order with ₹20 commission reported
           -- ₹100 and understated netProfit by the extra ₹80.
           o.commission / oic.itemCount as commission,
           o.packagingCost / oic.itemCount as packing,
           o.freightCharges / oic.itemCount as freight
    FROM order_items oi JOIN orders o ON oi.orderGuid=o.guid
    LEFT JOIN order_logistics ol ON o.guid=ol.orderGuid
    LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid=s.guid
    LEFT JOIN inventoryitemvariant itv ON s.itemVariantId=itv.itemVariantId
    JOIN (SELECT orderGuid, COUNT(*) as itemCount FROM order_items GROUP BY orderGuid) oic ON oic.orderGuid = o.guid
    ${s2.w}
  `, s2.params);

  const s3 = buildWhere(" WHERE s.isDeleted=0", "s.createdAt", true, "s");
  const [stockInRows] = await mysqlPool.query(`
    SELECT s.guid as _id, IFNULL(st.invoiceNo,'Stock In') as orderId, s.createdAt as dispatchDate,
           'Stock In' as status, 'Finalized' as logisticsStatus,
           0 as sellingPrice, COALESCE(NULLIF(s.landingPrice,0), itv.purchasePrice, 0) as landingPrice,
           IFNULL(v.vendorFirmName,'Internal') as firmName,
           'Inventory Inward' as customerName, itv.variantName as modelName, s.serialNumber as serialValue,
           'Printers' as category, MAX(st.invoiceFile) as invoiceFile
    FROM inventorystockinserial s
    LEFT JOIN inventoryitemvariant itv ON s.itemVariantId=itv.itemVariantId
    LEFT JOIN inventorystockindetail st_d ON s.stockInDetailId=st_d.stockInDetailId
    LEFT JOIN inventorystockin st ON st_d.stockInId=st.stockInId
    LEFT JOIN inventoryvendor v ON st.vendorId=v.vendorId
    ${s3.w} GROUP BY s.guid,s.createdAt,s.landingPrice,itv.variantName,itv.purchasePrice,s.serialNumber,st.invoiceNo,v.vendorFirmName
  `, s3.params);

  const s4 = buildWhere(" WHERE o.isDeleted=0", "o.issueDate", true, "o");
  const [stockOutRows] = await mysqlPool.query(`
    SELECT o.stockOutId as _id, COALESCE(o.orderId,o.refNo) as orderId, o.issueDate as dispatchDate,
           'Stock Out' as status, 'Finalized' as logisticsStatus,
           COALESCE(NULLIF(o.sellingPrice,0),SUM(d.sellingPrice)) as sellingPrice,
           SUM(IFNULL(ivs.lastPurchaseRate,IFNULL(ivs.avgPurchaseRate,0))*d.issueQty) as landingPrice,
           o.platformId as firmName, o.issuedBy as customerName,
           'Multiple Items' as modelName, 'NA' as serialValue, 'Stationery' as category,
           o.packingCost as packing, o.freightCost as freight, o.commission,
           o.invoiceFile
    FROM inventorystockout o JOIN inventorystockoutdetail d ON o.stockOutId=d.stockOutId
    LEFT JOIN inventoryvariantstock ivs ON d.itemVariantId=ivs.itemVariantId
    ${s4.w}
    GROUP BY o.stockOutId,o.orderId,o.refNo,o.issueDate,o.platformId,o.issuedBy,o.packingCost,o.freightCost,o.commission,o.sellingPrice,o.invoiceFile
  `, s4.params);

  // "Stationery" here means non-serialized stock value, mirroring the
  // Printer/Stationery split used for `transactions` above. Must exclude
  // trackable (serialized) items explicitly — inventoryvariantstock's
  // availablePCS is only ever incremented for those (Stock In, Add Serial
  // No.), never decremented on dispatch/return (see GetCurrentStock's own
  // comment on this), so it drifts stale/inflated over time. Without this
  // filter, a company with only serialized printers and zero real
  // stationery still showed a non-zero "stationery" total, entirely from
  // that stale counter.
  const [statStock] = await mysqlPool.query(
    `SELECT SUM(availablePCS*IFNULL(NULLIF(lastPurchaseRate,0),IFNULL(avgPurchaseRate,0))) as total
     FROM inventoryvariantstock ivs
     JOIN inventoryitemvariant iv ON ivs.itemVariantId=iv.itemVariantId
     JOIN inventoryitemmaster im ON iv.itemId=im.itemId
     WHERE iv.isDeleted=0 AND im.isTrackable=0${companyClause("iv")}`,
    companyParam
  );
  // Per-serial landingPrice is often left at 0 by the Stock-In finalize flow,
  // and inventoryitemvariant.purchasePrice alone is frequently stale/unset
  // too — this mirrors app/Inventory/GetCurrentStock/route.js's fallback
  // chain (already fixed for this exact "stock value reads 0" problem):
  // avg landing price of this item's other Available serials, then the most
  // recently created serial's landing price (any status), then
  // inventoryvariantstock's purchase rates, then finally purchasePrice.
  const [printStock] = await mysqlPool.query(
    `SELECT SUM(
       IFNULL(NULLIF(lp.avgLandingPrice, 0),
         IFNULL(NULLIF(lk.lastLandingPrice, 0),
           IFNULL(NULLIF(ivs.lastPurchaseRate, 0),
             IFNULL(NULLIF(ivs.avgPurchaseRate, 0), IFNULL(iv.purchasePrice, 0)))))
     ) as total
     FROM inventorystockinserial s
     JOIN inventoryitemvariant iv ON s.itemVariantId = iv.itemVariantId AND iv.isDeleted = 0
     LEFT JOIN inventoryvariantstock ivs ON iv.itemVariantId = ivs.itemVariantId
     LEFT JOIN (
       SELECT itemVariantId, AVG(NULLIF(landingPrice, 0)) as avgLandingPrice FROM inventorystockinserial
       WHERE serialStatus = 'Available' AND isDeleted = 0 GROUP BY itemVariantId
     ) lp ON s.itemVariantId = lp.itemVariantId
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
     ) lk ON s.itemVariantId = lk.itemVariantId
     WHERE s.serialStatus = 'Available' AND s.isDeleted = 0${companyClause("s")}`,
    companyParam
  );

  const transactions = [...stationeryRows, ...printerRows, ...stockInRows, ...stockOutRows].sort((a, b) => new Date(b.dispatchDate) - new Date(a.dispatchDate));
  return NextResponse.json({
    transactions,
    stockSummary: {
      total: Number(statStock[0]?.total || 0) + Number(printStock[0]?.total || 0),
      printer: Number(printStock[0]?.total || 0),
      stationery: Number(statStock[0]?.total || 0),
    },
  });
});
