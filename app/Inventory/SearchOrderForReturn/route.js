import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireAuth, ApiError } from "@/lib/auth";
import { authorizeInventory } from "@/lib/inventoryAuth";
import { withErrorHandling } from "@/lib/apiResponse";

// Universal Search order by Tracking ID, Order ID, or Bill No
export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  authorizeInventory(user, "GET");
  requireAuth(user);

  let query = new URL(request.url).searchParams.get("query");
  if (!query) throw new ApiError(400, "Search query required");
  query = query.trim();
  const decodedQuery = decodeURIComponent(query);

  const [inventoryOrders] = await mysqlPool.query(`
    SELECT
        o.stockOutId, o.refNo, o.orderId, o.trackingId, o.issueDate, o.issuedBy,
        d.stockOutDetailId, d.itemVariantId, d.issueQty,
        v.variantName, i.itemName
    FROM inventorystockout o
    JOIN inventorystockoutdetail d ON o.stockOutId = d.stockOutId
    JOIN inventoryitemvariant v ON d.itemVariantId = v.itemVariantId
    JOIN inventoryitemmaster i ON v.itemId = i.itemId
    WHERE (o.refNo LIKE ? OR o.orderId = ? OR o.trackingId = ? OR o.stockOutId = ?) AND o.isDeleted = 0 AND o.companyGuid = ?
  `, [`%${decodedQuery}%`, decodedQuery, decodedQuery, decodedQuery, user.companyId]);

  if (inventoryOrders.length > 0) {
    const result = {
      stockOutId: inventoryOrders[0].stockOutId,
      refNo: inventoryOrders[0].refNo || inventoryOrders[0].orderId || inventoryOrders[0].trackingId,
      issueDate: inventoryOrders[0].issueDate,
      issuedBy: inventoryOrders[0].issuedBy,
      source: "inventory",
      items: inventoryOrders.map((o) => ({
        detailId: o.stockOutDetailId,
        variantId: o.itemVariantId,
        variantName: o.variantName,
        itemName: o.itemName,
        quantity: o.issueQty,
      })),
    };
    return NextResponse.json({ data: result });
  }

  const [legacyOrders] = await mysqlPool.query(`
    SELECT
        oi.guid as dispatchGuid, o.invoiceNumber, ol.trackingId, o.dispatchDate, o.platform as firmName, o.orderid as customerName,
        sn.serialNumber as serialNumber, fbiv.variantName as modelName, o.ewayBillNumber
    FROM order_items oi
    JOIN orders o ON oi.orderGuid = o.guid
    LEFT JOIN order_logistics ol ON o.guid = ol.orderGuid
    LEFT JOIN inventorystockinserial sn ON oi.serialNumberGuid = sn.guid
    LEFT JOIN inventoryitemvariant fbiv ON sn.itemVariantId = fbiv.itemVariantId
    WHERE (o.invoiceNumber LIKE ? OR ol.trackingId LIKE ? OR sn.serialNumber = ? OR o.ewayBillNumber = ? OR CAST(oi.guid AS CHAR) = ?) AND o.isDeleted = 0 AND o.companyGuid = ?
  `, [`%${decodedQuery}%`, `%${decodedQuery}%`, decodedQuery, decodedQuery, decodedQuery, user.companyId]);

  if (legacyOrders.length > 0) {
    const result = {
      stockOutId: `LEGACY-${legacyOrders[0].dispatchGuid}`,
      refNo: `Bill: ${legacyOrders[0].invoiceNumber || "N/A"} | Track: ${legacyOrders[0].trackingId || "N/A"}`,
      issueDate: legacyOrders[0].dispatchDate,
      issuedBy: legacyOrders[0].firmName || legacyOrders[0].customerName,
      source: "legacy",
      items: legacyOrders.map((o) => ({
        detailId: o.dispatchGuid,
        variantId: null,
        variantName: o.modelName || "N/A",
        itemName: o.serialNumber ? `Serial: ${o.serialNumber}` : "Legacy Item",
        quantity: 1,
      })),
    };
    return NextResponse.json({ data: result });
  }

  const [serialMatch] = await mysqlPool.query(`
    SELECT
        o.stockOutId, o.refNo, o.issueDate, o.issuedBy,
        d.stockOutDetailId, d.itemVariantId, d.issueQty,
        v.variantName, i.itemName
    FROM inventorystockoutserial ss
    LEFT JOIN inventorystockinserial sis ON ss.stockInSerialId = sis.serialId
    JOIN inventorystockoutdetail d ON ss.stockOutDetailId = d.stockOutDetailId
    JOIN inventorystockout o ON d.stockOutId = o.stockOutId
    JOIN inventoryitemvariant v ON d.itemVariantId = v.itemVariantId
    JOIN inventoryitemmaster i ON v.itemId = i.itemId
    WHERE (ss.serialNumber = ? OR sis.serialNumber = ?) AND o.isDeleted = 0 AND o.companyGuid = ?
  `, [decodedQuery, decodedQuery, user.companyId]);

  if (serialMatch.length > 0) {
    const result = {
      stockOutId: serialMatch[0].stockOutId,
      refNo: serialMatch[0].refNo,
      issueDate: serialMatch[0].issueDate,
      issuedBy: serialMatch[0].issuedBy,
      source: "inventory-serial",
      items: serialMatch.map((o) => ({
        detailId: o.stockOutDetailId,
        variantId: o.itemVariantId,
        variantName: o.variantName,
        itemName: o.itemName,
        quantity: o.issueQty,
      })),
    };
    return NextResponse.json({ data: result });
  }

  const [bulkOrders] = await mysqlPool.query(`
    SELECT
        bo.guid as bulkOrderId, bo.customerName, bo.firmName, bo.createdAt,
        bod.trackingId, boi.invoiceNumber, boi.ewayBillNumber
    FROM bulkorders bo
    LEFT JOIN bulkorderdispatches bod ON bo.guid = bod.orderGuid
    LEFT JOIN bulkorderinvoices boi ON bo.guid = boi.orderGuid
    WHERE bod.trackingId = ? OR boi.invoiceNumber = ? OR boi.ewayBillNumber = ? OR bo.guid = ?
  `, [decodedQuery, decodedQuery, decodedQuery, decodedQuery]);

  if (bulkOrders.length > 0) {
    const [bulkItems] = await mysqlPool.query(`
        SELECT bi.serialNumberGuid, s.serialNumber as serialNumber, fbiv.variantName as modelName
        FROM bulkorderitems bi
        JOIN inventorystockinserial s ON bi.serialNumberGuid = s.guid
        LEFT JOIN inventoryitemvariant fbiv ON s.itemVariantId = fbiv.itemVariantId
        WHERE bi.orderGuid = ? AND bi.itemStatus = 'Active'
    `, [bulkOrders[0].bulkOrderId]);

    const result = {
      stockOutId: `BULK-${bulkOrders[0].bulkOrderId}`,
      refNo: `Bulk Order: ${bulkOrders[0].invoiceNumber || bulkOrders[0].trackingId || bulkOrders[0].bulkOrderId}`,
      issueDate: bulkOrders[0].createdAt,
      issuedBy: bulkOrders[0].firmName || bulkOrders[0].customerName,
      source: "bulk",
      items: bulkItems.map((item) => ({
        detailId: `BULK-ITEM-${item.serialNumberGuid}`,
        variantId: null,
        variantName: item.modelName,
        itemName: `Serial: ${item.serialNumber}`,
        quantity: 1,
      })),
    };
    return NextResponse.json({ data: result });
  }

  const [barcodeMatch] = await mysqlPool.query(`
    SELECT
        o.stockOutId, o.refNo, o.issueDate, o.issuedBy,
        d.stockOutDetailId, d.itemVariantId, d.issueQty,
        v.variantName, i.itemName
    FROM inventoryvariantbarcode vb
    JOIN inventorystockoutdetail d ON vb.itemVariantId = d.itemVariantId
    JOIN inventorystockout o ON d.stockOutId = o.stockOutId
    JOIN inventoryitemvariant v ON d.itemVariantId = v.itemVariantId
    JOIN inventoryitemmaster i ON v.itemId = i.itemId
    WHERE vb.barcode = ? AND o.isDeleted = 0 AND o.companyGuid = ?
    ORDER BY o.issueDate DESC LIMIT 1
  `, [decodedQuery, user.companyId]);

  if (barcodeMatch.length > 0) {
    const result = {
      stockOutId: barcodeMatch[0].stockOutId,
      refNo: barcodeMatch[0].refNo,
      issueDate: barcodeMatch[0].issueDate,
      issuedBy: barcodeMatch[0].issuedBy,
      source: "inventory-barcode",
      items: [{
        detailId: barcodeMatch[0].stockOutDetailId,
        variantId: barcodeMatch[0].itemVariantId,
        variantName: barcodeMatch[0].variantName,
        itemName: barcodeMatch[0].itemName,
        quantity: barcodeMatch[0].issueQty,
      }],
    };
    return NextResponse.json({ data: result });
  }

  throw new ApiError(404, "No order found with this Tracking ID, Order ID, or Bill No");
});
