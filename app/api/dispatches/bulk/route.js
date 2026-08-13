import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeDispatchRequest, requireCompany, ApiError } from "@/lib/auth";
import { safeStr, safeDate, normalizeBusinessStatus, normalizeLogisticsStatus, toBit } from "@/lib/helpers";
import { createDispatchInline } from "@/lib/dispatchHelpers";
import { createNotification } from "@/lib/notifications";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeDispatchRequest(user, "POST", body);

  const { items } = body;
  const connection = await mysqlPool.getConnection();
  try {
    const firstCustomer = safeStr(items[0]?.customerName || items[0]?.customer, "");
    if (firstCustomer && firstCustomer.toLowerCase() !== "n/a") {
      const [existing] = await connection.query(
        "SELECT guid FROM orders WHERE (orderid = ? OR customerName = ?) AND isDeleted = 0 AND companyGuid = ? LIMIT 1",
        [firstCustomer, firstCustomer, user.companyId]
      );
      if (existing.length > 0) {
        return NextResponse.json({ message: `Order ID "${firstCustomer}" already exists in the system.` }, { status: 400 });
      }
    }

    await connection.beginTransaction();

    for (const item of items) {
      const [serialCheck] = await connection.query(
        "SELECT s.serialStatus AS status, s.serialNumber AS serialValue, itv.packagingCost AS modelDefaultCost" +
        " FROM inventorystockinserial s JOIN inventoryitemvariant itv ON s.itemVariantId = itv.itemVariantId" +
        " WHERE s.guid = ? AND s.companyGuid = ?",
        [item.serialId, user.companyId]
      );

      if (serialCheck.length === 0) {
        await connection.rollback();
        return NextResponse.json({ message: `Serial ID ${item.serialId} not found` }, { status: 404 });
      }

      const serialData = serialCheck[0];
      const finalPackagingCost = (item.packagingCost !== undefined && item.packagingCost !== "" && item.packagingCost !== null)
        ? Number(item.packagingCost)
        : Number(serialData.modelDefaultCost || 0);

      const finalStatus = normalizeBusinessStatus(item.status || "Pending");
      const finalLogisticsStatus = normalizeLogisticsStatus(item.logisticsStatus);
      const installReqBit = toBit(item.installationRequired) ? "Yes" : "No";
      const installStatusBit = toBit(item.installationRequired) ? (item.installationStatus || "Pending") : null;

      const result = await createDispatchInline(connection, {
        companyGuid: user.companyId,
        serialId: item.serialId,
        firmName: item.firmName,
        customerName: safeStr(item.customerName || item.customer, ""),
        address: safeStr(item.address || item.shippingAddress, null),
        shippingAddress: safeStr(item.shippingAddress || item.address, null),
        user: item.user || "System",
        sellingPrice: item.sellingPrice || 0,
        status: finalStatus,
        orderVerified: item.orderVerified || "No",
        gemOrderType: item.orderType || item.gemOrderType || null,
        bidNumber: item.bidNo || item.bidNumber || null,
        orderDate: item.orderDate, lastDeliveryDate: item.lastDeliveryDate,
        gstNumber: item.gstNumber || null, contactNumber: item.contactNumber || null,
        altContactNumber: item.altContactNumber || null, buyerEmail: item.buyerEmail || null,
        consigneeEmail: item.consigneeEmail || null, paymentAuthorityEmail: item.paymentAuthorityEmail || null,
        consigneeName: item.consigneeName || null,
        contractFilename: item.contractFile || item.contractFilename || null,
        installationRequired: installReqBit, installationStatus: installStatusBit,
        technicianName: item.technicianName || null, technicianContact: item.technicianContact || null,
        installationCharges: item.installationCharges || 0, installationRemarks: item.installationRemarks || null,
        scheduledDate: item.scheduledDate, packagingCost: finalPackagingCost, commission: item.commission || 0,
        courierPartner: item.courierPartner || null, logisticsDispatchDate: item.logisticsDispatchDate,
        trackingId: item.trackingId || null, freightCharges: item.freightCharges || 0,
        logisticsStatus: finalLogisticsStatus, podFilename: item.podFilename || null,
        ewayBillFilename: item.ewayBillFilename || null, remarks: item.remarks || null,
        warranty: item.warranty || null, buyerAddress: safeStr(item.buyerAddress, null),
        platformFields: item.platformFields ? JSON.stringify(item.platformFields) : null,
      });

      if (!result.success) {
        await connection.rollback();
        return NextResponse.json({ message: `Failed for item ${item.serialId}: ${result.message}` }, { status: 400 });
      }

      const { orderId: itemOrderId } = result;

      let updateQ = "UPDATE orders SET ";
      let updateParams = [];
      if (item.paymentAuthorityEmail) { updateQ += "paymentAuthorityEmail = ?, "; updateParams.push(item.paymentAuthorityEmail); }
      if (item.invoiceNumber) { updateQ += "invoiceNumber = ?, "; updateParams.push(item.invoiceNumber); }
      if (item.invoiceDate) { updateQ += "invoiceDate = ?, "; updateParams.push(safeDate(item.invoiceDate)); }
      if (item.warrantyStartDate !== undefined) { updateQ += "warrantyStartDate = ?, "; updateParams.push(safeDate(item.warrantyStartDate) || null); }
      if (item.invoiceFilename) { updateQ += "invoiceFilename = ?, "; updateParams.push(item.invoiceFilename); }
      if (updateParams.length > 0) {
        updateQ = updateQ.slice(0, -2) + " WHERE guid = ? AND companyGuid = ?";
        updateParams.push(itemOrderId, user.companyId);
        await connection.query(updateQ, updateParams);
      }
    }

    try {
      await createNotification(mysqlPool, {
        targetRole: "Admin",
        title: "Bulk Dispatch Created",
        message: `${items.length} new dispatch orders have been created.`,
        type: "success",
        link: "/dispatch",
        companyGuid: user.companyId,
      });
    } catch (notifErr) {
      console.error("Error sending bulk order notification:", notifErr);
    }

    await connection.commit();
    return NextResponse.json({ message: "Bulk Dispatch Successful" });
  } catch (err) {
    await connection.rollback();
    if (err instanceof ApiError) throw err;
    return NextResponse.json({ message: "Bulk dispatch failed.", error: err.message }, { status: 500 });
  } finally {
    connection.release();
  }
});
