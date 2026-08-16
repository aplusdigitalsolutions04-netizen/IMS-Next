import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany } from "@/lib/auth";
import { authorizeReports } from "@/lib/reportsAuth";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeReports(user, "GET");

  const { searchParams } = new URL(request.url);
  let startDate = searchParams.get("startDate");
  let endDate = searchParams.get("endDate");

  // Without a default bound, an unfiltered request joins across the
  // company's ENTIRE order history — for a long-running company that grows
  // heavier every month and risks pulling the whole table into memory.
  // Default to the last 90 days when no explicit range was requested; an
  // explicit range (even a wide one) is still honored as the caller asked.
  if (!startDate || !endDate) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 90);
    startDate = start.toISOString();
    endDate = end.toISOString();
  }

  // s.landingPrice is unreliable (often left at 0 by the Stock-In finalize
  // flow — see app/api/reports/route.js for the same issue) — fall back to
  // the item's current purchasePrice from Item Master when that happens.
  const dateFilterSql = " AND o.dispatchDate>=? AND o.dispatchDate<=?";
  const dateFilterParams = [`${startDate.split("T")[0]} 00:00:00`, `${endDate.split("T")[0]} 23:59:59`];

  const rowsQuery = `
    SELECT o.dispatchDate, o.platform AS firmName, o.orderid as customer,
           oi.sellingPrice * COALESCE(oi.quantity, 1) as sellingPrice,
           COALESCE(NULLIF(s.landingPrice, 0), itv.purchasePrice, 0) * COALESCE(oi.quantity, 1) as landingPrice,
           itv.variantName as modelName, bm.brandName as companyName,
           s.serialNumber as serialNumber, ins.installationRequired, ins.installationCharges,
           o.packagingCost, o.commission, o.status
    FROM order_items oi JOIN orders o ON oi.orderGuid=o.guid
    LEFT JOIN order_installations ins ON o.guid=ins.orderGuid
    LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid=s.guid
    LEFT JOIN inventoryitemvariant itv ON s.itemVariantId=itv.itemVariantId AND itv.isDeleted=0
    LEFT JOIN inventoryitemmaster im ON itv.itemId=im.itemId
    LEFT JOIN inventorybrandmaster bm ON im.brandId=bm.brandId
    WHERE o.isDeleted=0 AND o.companyGuid=? ${dateFilterSql}
    ORDER BY o.dispatchDate DESC
  `;
  const [sales] = await mysqlPool.query(rowsQuery, [user.companyId, ...dateFilterParams]);

  // Aggregated in SQL instead of Array.reduce over the fetched rows — same
  // WHERE clause, computed by the database instead of walking the full
  // result set again in Node for each of the 5 totals.
  // sellingPrice and landingPrice are both per-unit; serialized rows are
  // always quantity 1 (one row per serial) but non-serialized rows collapse
  // multiple units into a single row, so both sides must multiply by
  // quantity or revenue/cost/profit all undercount those lines.
  const summaryQuery = `
    SELECT
      COUNT(*) as totalSales,
      COALESCE(SUM(oi.sellingPrice * COALESCE(oi.quantity, 1)), 0) as totalRevenue,
      COALESCE(SUM((COALESCE(NULLIF(s.landingPrice, 0), itv.purchasePrice, 0) * COALESCE(oi.quantity, 1)) + IFNULL(o.packagingCost, 0) + IFNULL(o.commission, 0)), 0) as totalCost,
      COALESCE(SUM((oi.sellingPrice - COALESCE(NULLIF(s.landingPrice, 0), itv.purchasePrice, 0)) * COALESCE(oi.quantity, 1) - IFNULL(o.packagingCost, 0) - IFNULL(o.commission, 0)), 0) as totalProfit,
      COALESCE(SUM(CASE WHEN ins.installationRequired IN ('Yes', 'true', '1') THEN IFNULL(ins.installationCharges, 0) ELSE 0 END), 0) as totalInstallationCharges
    FROM order_items oi JOIN orders o ON oi.orderGuid=o.guid
    LEFT JOIN order_installations ins ON o.guid=ins.orderGuid
    LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid=s.guid
    LEFT JOIN inventoryitemvariant itv ON s.itemVariantId=itv.itemVariantId AND itv.isDeleted=0
    WHERE o.isDeleted=0 AND o.companyGuid=? ${dateFilterSql}
  `;
  const [[summaryRow]] = await mysqlPool.query(summaryQuery, [user.companyId, ...dateFilterParams]);
  const summary = {
    totalSales: Number(summaryRow.totalSales) || 0,
    totalRevenue: Number(summaryRow.totalRevenue) || 0,
    totalCost: Number(summaryRow.totalCost) || 0,
    totalProfit: Number(summaryRow.totalProfit) || 0,
    totalInstallationCharges: Number(summaryRow.totalInstallationCharges) || 0,
  };
  return NextResponse.json({ summary, sales });
});
