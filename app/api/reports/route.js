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
           'Printers' as category, o.invoiceFilename as invoiceFile, o.ewayBillFilename as ewayBillFile
    FROM order_items oi JOIN orders o ON oi.orderGuid=o.guid
    LEFT JOIN order_logistics ol ON o.guid=ol.orderGuid
    LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid=s.guid
    LEFT JOIN inventoryitemvariant itv ON s.itemVariantId=itv.itemVariantId
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

  const [statStock] = await mysqlPool.query(
    `SELECT SUM(availablePCS*IFNULL(NULLIF(lastPurchaseRate,0),IFNULL(avgPurchaseRate,0))) as total
     FROM inventoryvariantstock ivs JOIN inventoryitemvariant iv ON ivs.itemVariantId=iv.itemVariantId
     WHERE iv.isDeleted=0${companyClause("iv")}`,
    companyParam
  );
  // inventorystockinserial.landingPrice is unreliable (often left at 0 by the
  // Stock-In finalize flow) — inventoryitemvariant.purchasePrice is the
  // item's actual, maintained purchase price, so value each Available
  // serial at its item's current purchasePrice instead.
  const [printStock] = await mysqlPool.query(
    `SELECT SUM(iv.purchasePrice) as total
     FROM inventorystockinserial s
     JOIN inventoryitemvariant iv ON s.itemVariantId = iv.itemVariantId AND iv.isDeleted = 0
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
