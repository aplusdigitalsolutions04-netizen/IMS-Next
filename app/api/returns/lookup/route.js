import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, requireCompany, ApiError } from "@/lib/auth";
import { authorizeReturns } from "@/lib/returnsAuth";
import { mapDispatchRow } from "@/lib/helpers";
import { withErrorHandling } from "@/lib/apiResponse";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeReturns(user, "GET");

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("serialValue") || searchParams.get("serialNumber") || searchParams.get("serial");
  if (!raw) throw new ApiError(400, "Serial number is required");
  const normalized = raw.trim().toUpperCase();

  const [serials] = await mysqlPool.query(`
    SELECT s.*, fbiv.variantName as modelName, fbbm.brandName as companyName,
           lr.reason as latestReturnReason, lr.condition as latestReturnCondition
    FROM inventorystockinserial s
    LEFT JOIN inventoryitemvariant fbiv ON s.itemVariantId=fbiv.itemVariantId
    LEFT JOIN inventoryitemmaster fbim ON fbiv.itemId=fbim.itemId
    LEFT JOIN inventorybrandmaster fbbm ON fbim.brandId=fbbm.brandId
    LEFT JOIN (
      SELECT r1.serialNumberGuid, r1.reason, r1.condition FROM returns r1
      JOIN (SELECT serialNumberGuid, MAX(returnDate) as maxDate, MAX(guid) as maxId FROM returns WHERE isDeleted=0 GROUP BY serialNumberGuid) r2
      ON r1.serialNumberGuid=r2.serialNumberGuid AND r1.returnDate=r2.maxDate AND r1.guid=r2.maxId
    ) lr ON s.guid=lr.serialNumberGuid
    WHERE s.serialNumber=? AND s.isDeleted=0 AND s.companyGuid=?
  `, [normalized, user.companyId]);

  if (!serials.length) throw new ApiError(404, "Serial not found");
  const serial = serials[0];

  const [dispatches] = await mysqlPool.query(`
    SELECT oi.guid, oi.serialNumberGuid, oi.modelGuid, oi.sellingPrice, oi.warranty, oi.quantity, oi.contractFilename,
           o.guid as _orderId, o.orderid, o.platform, o.orderDate, o.dispatchDate, o.dispatchedBy, o.status,
           o.gemOrderType, o.bidNumber, o.customerName as customer, o.consigneeName, o.buyerEmail, o.consigneeEmail,
           o.paymentAuthorityEmail, o.shippingAddress, o.address, o.gstNumber, o.contactNumber, o.altContactNumber,
           o.invoiceNumber, o.invoiceFilename, o.ewayBillNumber, o.ewayBillFilename, o.gemBillUploaded,
           o.freightCharges, o.packagingCost, o.commission, o.orderVerified, o.remarks, o.cancellationReason as cancelReason,
           o.cancelledBy, o.cancelledAt, o.isDeleted, o.rowColor, o.tags,
           ol.courierPartner, ol.trackingId, ol.logisticsStatus, ol.logisticsDispatchDate, ol.podFilename, ol.lastDeliveryDate,
           ins.installationRequired, ins.installationStatus, ins.technicianName, ins.technicianContact,
           ins.installationCharges, ins.installationRemarks, ins.scheduledDate, ins.installationDate,
           fbiv2.variantName as modelName, s.serialNumber as serialValue
    FROM order_items oi JOIN orders o ON oi.orderGuid=o.guid
    JOIN inventorystockinserial s ON oi.serialNumberGuid=s.guid
    LEFT JOIN inventoryitemvariant fbiv2 ON s.itemVariantId=fbiv2.itemVariantId
    LEFT JOIN order_logistics ol ON o.guid=ol.orderGuid LEFT JOIN order_installations ins ON o.guid=ins.orderGuid
    WHERE oi.serialNumberGuid=? AND o.isDeleted=0 AND o.companyGuid=?
    ORDER BY o.dispatchDate DESC, oi.guid DESC LIMIT 1
  `, [serial.guid, user.companyId]);

  const linkedOrder = dispatches[0] || null;
  let existingReturn = null;
  if (linkedOrder) {
    const [ret] = await mysqlPool.query("SELECT * FROM returns WHERE serialNumberGuid=? AND dispatchGuid=? AND isDeleted=0 AND companyGuid=? ORDER BY returnDate DESC, guid DESC LIMIT 1", [serial.guid, linkedOrder.guid, user.companyId]);
    existingReturn = ret[0] || null;
  }

  // A serial only ever gets serialStatus='Sold' from FBF/FBA sell-out (see
  // app/api/fbf-fba/sell-out/route.js) — it never goes through order_items/
  // orders, so linkedOrder is always null for these. Same scan-a-serial →
  // pick condition → confirm flow as a regular Dispatched-order return, just
  // without an order to look up; app/api/returns/route.js's POST handler
  // skips the order/dispatch requirement for this case too.
  const isFbfFbaSoldReturn = serial.serialStatus === "Sold";

  return NextResponse.json({
    ...serial,
    canReturn: (serial.serialStatus === "Dispatched" && !!linkedOrder && !existingReturn) || isFbfFbaSoldReturn,
    isFbfFbaSoldReturn,
    linkedOrder: linkedOrder ? mapDispatchRow(linkedOrder) : null,
    existingReturnForLinkedOrder: existingReturn,
    smartWarning: serial.returnCount > 0
      ? `This serial was previously returned${serial.latestReturnReason ? ` (Reason: ${serial.latestReturnReason})` : ""}.`
      : isFbfFbaSoldReturn
        ? `This item was sold via ${serial.fbfFbaType || "FBF/FBA"} — returning it restocks it to main inventory.`
        : null,
  });
});
