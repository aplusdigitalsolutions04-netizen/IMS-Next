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
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  // s.landingPrice is unreliable (often left at 0 by the Stock-In finalize
  // flow — see app/api/reports/route.js for the same issue) — fall back to
  // the item's current purchasePrice from Item Master when that happens.
  let q = `
    SELECT o.dispatchDate, o.platform AS firmName, o.orderid as customer,
           oi.sellingPrice, COALESCE(NULLIF(s.landingPrice, 0), itv.purchasePrice, 0) as landingPrice,
           itv.variantName as modelName, bm.brandName as companyName,
           s.serialNumber as serialNumber, ins.installationRequired, ins.installationCharges,
           o.packagingCost, o.commission, o.status
    FROM order_items oi JOIN orders o ON oi.orderGuid=o.guid
    LEFT JOIN order_installations ins ON o.guid=ins.orderGuid
    LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid=s.guid
    LEFT JOIN inventoryitemvariant itv ON s.itemVariantId=itv.itemVariantId AND itv.isDeleted=0
    LEFT JOIN inventoryitemmaster im ON itv.itemId=im.itemId
    LEFT JOIN inventorybrandmaster bm ON im.brandId=bm.brandId
    WHERE o.isDeleted=0 AND o.companyGuid=?
  `;
  const sqlParams = [user.companyId];
  if (startDate && endDate) { q += " AND o.dispatchDate>=? AND o.dispatchDate<=?"; sqlParams.push(`${startDate.split("T")[0]} 00:00:00`, `${endDate.split("T")[0]} 23:59:59`); }
  q += " ORDER BY o.dispatchDate DESC";
  const [sales] = await mysqlPool.query(q, sqlParams);

  const isInstall = (i) => i.installationRequired === 1 || i.installationRequired === "Yes" || i.installationRequired === true || i.installationRequired === "true";
  const summary = {
    totalSales: sales.length,
    totalRevenue: sales.reduce((s, r) => s + (Number(r.sellingPrice) || 0), 0),
    totalCost: sales.reduce((s, r) => s + (Number(r.landingPrice) || 0) + (Number(r.packagingCost) || 0) + (Number(r.commission) || 0), 0),
    totalProfit: sales.reduce((s, r) => s + ((Number(r.sellingPrice) || 0) - (Number(r.landingPrice) || 0) - (Number(r.packagingCost) || 0) - (Number(r.commission) || 0)), 0),
    totalInstallationCharges: sales.reduce((s, r) => (isInstall(r) ? s + (Number(r.installationCharges) || 0) : s), 0),
  };
  return NextResponse.json({ summary, sales });
});
