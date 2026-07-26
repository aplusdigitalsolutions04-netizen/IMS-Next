export const ORDER_SELECT = `
  SELECT oi.guid as id, oi.serialNumberGuid as serialNumberId, oi.modelGuid as modelId, oi.itemVariantId,
    oi.sellingPrice, oi.warranty, oi.quantity, oi.contractFilename, oi.warrantyStartDate as itemWarrantyStartDate,
    o.guid as _orderId, o.orderid, o.platform, o.orderDate, o.dispatchDate, o.dispatchedBy, o.status,
    o.gemOrderType, o.bidNumber, o.customerName as customer, o.consigneeName, o.buyerEmail, o.consigneeEmail,
    o.paymentAuthorityEmail, o.shippingAddress, o.address, o.buyerAddress, o.gstNumber,
    o.contactNumber, o.altContactNumber, o.invoiceNumber, o.invoiceDate, o.warrantyStartDate, o.invoiceFilename, o.ewayBillNumber,
    o.ewayBillFilename, o.gemBillUploaded, o.freightCharges, o.packagingCost, o.commission,
    o.orderVerified, oi.remarks AS remarks, o.remarks AS orderRemarks, o.cancellationReason as cancelReason,
    o.cancelledBy, o.cancelledAt, o.isDeleted, o.rowColor, o.tags, o.draftSentToBilling,
    ol.courierPartner, ol.trackingId, ol.logisticsStatus, ol.logisticsDispatchDate, ol.podFilename, ol.lastDeliveryDate,
    ins.installationRequired, ins.installationStatus, ins.technicianName, ins.technicianContact,
    ins.installationCharges, ins.installationRemarks, ins.scheduledDate, ins.installationDate,
    COALESCE(s.serialNumber, sm.serialValue) as serialValue,
    itv.variantName as modelName,
    ib.brandName as companyName,
    p.paymentDate as paymentReceivedDate, p.amount as paymentReceivedAmount, p.utrId
  FROM order_items oi JOIN orders o ON oi.orderGuid=o.guid AND o.companyGuid=?
  LEFT JOIN order_logistics ol ON o.guid=ol.orderGuid AND ol.companyGuid=?
  LEFT JOIN order_installations ins ON o.guid=ins.orderGuid AND ins.companyGuid=?
  LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid=s.guid AND s.companyGuid=?
  LEFT JOIN inventoryitemvariant itv ON COALESCE(oi.itemVariantId, s.itemVariantId)=itv.itemVariantId AND itv.companyGuid=?
  LEFT JOIN inventoryitemmaster iim ON itv.itemId=iim.itemId AND iim.companyGuid=?
  LEFT JOIN inventorybrandmaster ib ON iim.brandId=ib.brandId AND ib.companyGuid=?
  LEFT JOIN (SELECT serialNumberGuid, MAX(serialValue) as serialValue FROM serialmovements GROUP BY serialNumberGuid) sm ON oi.serialNumberGuid=sm.serialNumberGuid
  LEFT JOIN payments p ON oi.guid=p.dispatchGuid AND p.companyGuid=?
`;
