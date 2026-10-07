import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany } from "@/lib/auth";
import { authorizeWarranty } from "@/lib/warrantyAuth";
import { withErrorHandling } from "@/lib/apiResponse";
import { ensurePlatformWarrantyColumn } from "@/lib/platformsMigration";

// Orders for cert generation: every order of a platform that has Warranty
// switched on in Settings → Platform Master (GeM by default) — serialized or
// non-serialized alike. Orders and their items are fetched separately and
// joined here (no cross-table guid JOINs, which hit collation mismatches).
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeWarranty(user, "GET");
  await ensurePlatformWarrantyColumn();

  const [platformRows] = await mysqlPool.query("SELECT name FROM selling_platforms WHERE warrantyEnabled = 1");
  const platforms = platformRows.map((p) => String(p.name).toLowerCase());
  if (!platforms.length) return NextResponse.json([]);

  const [orders] = await mysqlPool.query(`
    SELECT
      o.guid          AS orderGuid,
      o.orderid       AS orderNumber,
      o.platform,
      o.gemOrderType,
      o.bidNumber,
      o.customerName  AS customer,
      o.consigneeName,
      o.shippingAddress,
      o.address,
      o.buyerAddress,
      o.contactNumber,
      o.altContactNumber,
      o.invoiceNumber,
      o.gstNumber,
      o.orderDate,
      o.dispatchDate,
      o.status
    FROM orders o
    WHERE o.isDeleted = 0 AND o.companyGuid = ? AND LOWER(o.platform) IN (?)
    ORDER BY o.dispatchDate DESC, o.orderDate DESC
  `, [user.companyId, platforms]);
  if (!orders.length) return NextResponse.json([]);

  // Model comes from the serial's variant when the item has a serial, and
  // straight from the order item's own variant when it is non-serialized.
  const [items] = await mysqlPool.query(`
    SELECT
      oi.orderGuid,
      oi.sellingPrice,
      oi.warranty,
      oi.quantity,
      oi.remarks,
      s.serialNumber AS serialValue,
      v.variantName  AS modelName,
      b.brandName    AS companyName
    FROM order_items oi
    LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid = s.guid AND s.companyGuid = oi.companyGuid
    LEFT JOIN inventoryitemvariant v ON v.itemVariantId = COALESCE(s.itemVariantId, oi.itemVariantId) AND v.companyGuid = oi.companyGuid
    LEFT JOIN inventoryitemmaster im ON v.itemId = im.itemId AND im.companyGuid = oi.companyGuid
    LEFT JOIN inventorybrandmaster b ON im.brandId = b.brandId AND b.companyGuid = oi.companyGuid
    WHERE oi.companyGuid = ? AND oi.orderGuid IN (?)
  `, [user.companyId, orders.map((o) => o.orderGuid)]);

  const byOrder = new Map();
  for (const it of items) {
    if (!byOrder.has(it.orderGuid)) byOrder.set(it.orderGuid, []);
    byOrder.get(it.orderGuid).push(it);
  }

  const result = orders.map((o) => {
    const its = byOrder.get(o.orderGuid) || [];
    const first = its.find((i) => i.serialValue) || its[0] || {};
    const models = [...new Set(its.map((i) => i.modelName || i.remarks).filter(Boolean))];
    const serials = its.map((i) => i.serialValue).filter(Boolean);
    return {
      ...o,
      sellingPrice: first.sellingPrice ?? null,
      warranty: first.warranty ?? null,
      serialValue: serials[0] || null,
      modelName: models.length > 1 ? `${models[0]} +${models.length - 1} more` : (models[0] || null),
      allModels: models.join(", "),
      allSerials: serials.join(", "),
      companyName: first.companyName || null,
      itemCount: its.length,
    };
  });
  return NextResponse.json(result);
});
