import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeDispatchRequest, ApiError } from "@/lib/auth";
import { mapDispatchRow } from "@/lib/helpers";
import { updateDispatchItem } from "@/lib/dispatchHelpers";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request, { params }) => {
  const user = await authenticateRequest(request);
  authorizeDispatchRequest(user, "GET", null);
  const { id: guid } = await params;

  if (guid.startsWith("SO-")) {
    const [stockOutRows] = await mysqlPool.query(`
      SELECT
        o.*,
        'Inventory' as firmName,
        o.issuedBy as customerName,
        o.issueDate as dispatchDate,
        'Delivered' as status,
        'Delivered' as logisticsStatus
      FROM inventorystockout o
      WHERE o.stockOutId = ? AND o.isDeleted = 0 AND o.companyGuid = ?
    `, [guid, user.companyId]);

    if (stockOutRows.length === 0) throw new ApiError(404, "Stock Out not found");

    const [items] = await mysqlPool.query(`
      SELECT d.*, v.variantName, i.itemName
      FROM inventorystockoutdetail d
      JOIN inventoryitemvariant v ON d.itemVariantId = v.itemVariantId
      JOIN inventoryitemmaster i ON v.itemId = i.itemId
      WHERE d.stockOutId = ?
    `, [guid]);

    return NextResponse.json({
      id: stockOutRows[0].stockOutId,
      firmName: "Inventory",
      customerName: stockOutRows[0].issuedBy,
      dispatchDate: stockOutRows[0].issueDate,
      status: "Delivered",
      logisticsStatus: "Delivered",
      invoiceNumber: stockOutRows[0].refNo,
      gemContact: "N/A",
      modelName: items[0]?.variantName || "N/A",
      quantity: items[0]?.issueQty || 1,
      sellingPrice: 0,
    });
  }

  const [rows] = await mysqlPool.query(`
    SELECT
        oi.guid as id, oi.serialNumberGuid as serialGuid, oi.modelGuid, oi.sellingPrice, oi.warranty, oi.quantity, oi.contractFilename, oi.warrantyStartDate as itemWarrantyStartDate,
        o.guid as _orderId, o.orderid, o.platform, o.orderDate, o.createdAt, o.dispatchDate, o.dispatchedBy, o.status,
        o.gemOrderType, o.bidNumber, o.customerName as customer, o.consigneeName, o.buyerEmail, o.consigneeEmail,
        o.paymentAuthorityEmail,
        o.shippingAddress, o.address, o.buyerAddress, o.gstNumber, o.contactNumber, o.altContactNumber, o.invoiceNumber,
        o.invoiceDate, o.warrantyStartDate, o.invoiceFilename, o.ewayBillNumber, o.ewayBillFilename, o.gemBillUploaded, o.freightCharges,
        o.packagingCost, o.commission, o.orderVerified, oi.remarks AS remarks, o.remarks AS orderRemarks, o.cancellationReason as cancelReason,
        o.cancelledBy, o.cancelledAt, o.isDeleted, o.rowColor, o.tags,
        ol.courierPartner, ol.trackingId, ol.logisticsStatus, ol.logisticsDispatchDate, ol.podFilename, ol.lastDeliveryDate,
        ins.installationRequired, ins.installationStatus, ins.technicianName, ins.technicianContact,
        ins.installationCharges, ins.installationRemarks, ins.scheduledDate, ins.installationDate,
        s.serialNumber as serialValue, s.landingPrice,
        fbiv.variantName as modelName, fbbm.brandName as companyName,
        p.paymentDate as paymentReceivedDate, p.amount as paymentReceivedAmount, p.utrId
    FROM order_items oi
    JOIN orders o ON oi.orderGuid = o.guid
    LEFT JOIN order_logistics ol ON o.guid = ol.orderGuid
    LEFT JOIN order_installations ins ON o.guid = ins.orderGuid
    LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid = s.guid
    LEFT JOIN inventoryitemvariant fbiv ON s.itemVariantId = fbiv.itemVariantId
    LEFT JOIN inventoryitemmaster fbim ON fbiv.itemId = fbim.itemId
    LEFT JOIN inventorybrandmaster fbbm ON fbim.brandId = fbbm.brandId
    LEFT JOIN (
        SELECT p1.dispatchGuid, p1.paymentDate, p1.amount, p1.utrId
        FROM payments p1
        INNER JOIN (SELECT dispatchGuid, MAX(paymentDate) AS maxDate FROM payments GROUP BY dispatchGuid) p2
        ON p1.dispatchGuid = p2.dispatchGuid AND p1.paymentDate = p2.maxDate
    ) p ON oi.guid = p.dispatchGuid
    WHERE oi.guid = ? AND o.companyGuid = ?
  `, [guid, user.companyId]);

  if (rows.length === 0) throw new ApiError(404, "Dispatch not found");
  return NextResponse.json(mapDispatchRow(rows[0]));
});

export const PUT = withErrorHandling(async (request, { params }) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  authorizeDispatchRequest(user, "PUT", body);
  const { id: guid } = await params;

  if (guid.startsWith("SO-")) {
    const { commission } = body;
    const [stockOutCheck] = await mysqlPool.query("SELECT * FROM inventorystockout WHERE stockOutId = ? AND isDeleted = 0 AND companyGuid = ?", [guid, user.companyId]);
    if (stockOutCheck.length === 0) throw new ApiError(404, "Stock Out not found");

    await mysqlPool.query("UPDATE inventorystockout SET commission = ? WHERE stockOutId = ? AND companyGuid = ?", [commission || 0, guid, user.companyId]);
    return NextResponse.json({ message: "Updated successfully" });
  }

  await updateDispatchItem(mysqlPool, guid, body, user?.username, user.companyId);
  return NextResponse.json({ message: "Dispatch updated successfully" });
});
