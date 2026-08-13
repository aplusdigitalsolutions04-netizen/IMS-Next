import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import { authenticateRequest, authorizeDispatchRequest, requireCompany, resolveScopedCompanyGuid } from "@/lib/auth";
import { mapDispatchRow, safeStr, safeDate, normalizeBusinessStatus, normalizeLogisticsStatus, toBit } from "@/lib/helpers";
import { createDispatchInline, createNonSerializedDispatchInline, updateDispatchItem, notifyPendingGemUploads } from "@/lib/dispatchHelpers";
import { createNotification } from "@/lib/notifications";
import { withErrorHandling, parseJsonBody } from "@/lib/apiResponse";
import { broadcastRealtimeEvent } from "@/lib/realtimeEvents";

export const GET = withErrorHandling(async (request) => {
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeDispatchRequest(user, "GET", null);

  notifyPendingGemUploads(mysqlPool);

  const { searchParams } = new URL(request.url);
  const includeDeleted = searchParams.get("includeDeleted") === "true" ? 1 : 0;

  const companyGuid = resolveScopedCompanyGuid(user, request);
  const c = (alias) => (companyGuid ? `AND ${alias}.companyGuid = ?` : "");
  const params = companyGuid ? Array(9).fill(companyGuid) : [];
  if (companyGuid) params.push(companyGuid); // oi.companyGuid, in the WHERE
  params.push(includeDeleted);
  if (companyGuid) params.push(companyGuid); // o.companyGuid, in the WHERE

  const [rows] = await mysqlPool.query(`
    SELECT
        oi.guid as id, oi.serialNumberGuid as serialGuid, oi.modelGuid, oi.sellingPrice, oi.warranty, oi.quantity, oi.contractFilename, oi.warrantyStartDate as itemWarrantyStartDate,
        o.guid as _orderId, o.orderid, o.platform, o.orderDate, o.dispatchDate, o.dispatchedBy, o.status,
        o.gemOrderType, o.bidNumber, o.customerName as customer, o.consigneeName, o.buyerEmail, o.consigneeEmail,
        o.paymentAuthorityEmail,
        o.shippingAddress, o.address, o.buyerAddress, o.gstNumber, o.contactNumber, o.altContactNumber, o.invoiceNumber,
        o.invoiceDate, o.warrantyStartDate, o.invoiceFilename, o.ewayBillNumber, o.ewayBillFilename, o.gemBillUploaded, o.freightCharges,
        o.packagingCost, o.commission, o.orderVerified, oi.remarks AS remarks, o.remarks AS orderRemarks, o.cancellationReason as cancelReason,
        o.cancelledBy, o.cancelledAt, o.isDeleted, o.rowColor, o.tags, o.draftSentToBilling,
        ol.courierPartner, ol.trackingId, ol.logisticsStatus, ol.logisticsDispatchDate, ol.podFilename, ol.lastDeliveryDate,
        ins.installationRequired, ins.installationStatus, ins.technicianName, ins.technicianContact,
        ins.installationCharges, ins.installationRemarks, ins.scheduledDate, ins.installationDate,
        s.serialNumber as serialValue, s.landingPrice,
        fbiv.variantName as modelName, fbbm.brandName as companyName,
        p.paymentDate as paymentReceivedDate, p.amount as paymentReceivedAmount, p.utrId
    FROM order_items oi
    JOIN orders o ON oi.orderGuid = o.guid ${c("o")}
    JOIN companies co ON oi.companyGuid = co.guid AND co.isActive = 1
    LEFT JOIN order_logistics ol ON o.guid = ol.orderGuid ${c("ol")}
    LEFT JOIN order_installations ins ON o.guid = ins.orderGuid ${c("ins")}
    LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid = s.guid ${c("s")}
    LEFT JOIN inventoryitemvariant fbiv ON s.itemVariantId = fbiv.itemVariantId ${c("fbiv")}
    LEFT JOIN inventoryitemmaster fbim ON fbiv.itemId = fbim.itemId ${c("fbim")}
    LEFT JOIN inventorybrandmaster fbbm ON fbim.brandId = fbbm.brandId ${c("fbbm")}
    LEFT JOIN (
        SELECT p1.dispatchGuid, p1.paymentDate, p1.amount, p1.utrId
        FROM payments p1
        INNER JOIN (SELECT dispatchGuid, MAX(paymentDate) AS maxDate FROM payments WHERE 1=1 ${c("payments")} GROUP BY dispatchGuid) p2
        ON p1.dispatchGuid = p2.dispatchGuid AND p1.paymentDate = p2.maxDate ${c("p1")}
    ) p ON oi.guid = p.dispatchGuid
    WHERE ${companyGuid ? "oi.companyGuid = ? AND" : ""} (? = 1 OR o.isDeleted = 0) ${companyGuid ? "AND o.companyGuid = ?" : ""}
    ORDER BY o.dispatchDate DESC
  `, params);

  return NextResponse.json(rows.map(mapDispatchRow));
});

export const POST = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeDispatchRequest(user, "POST", body);

  const {
    serialId, modelGuid, itemVariantId, quantity, nonSerialized, firmName, customer, customerName, address, shippingAddress, user: bodyUser,
    sellingPrice, status, orderVerified, gemOrderType, bidNumber, orderDate,
    lastDeliveryDate, gstNumber, contactNumber, altContactNumber, buyerEmail,
    consigneeEmail, consigneeName, contractFilename, installationRequired, installationStatus,
    technicianName, technicianContact, installationCharges, installationRemarks,
    scheduledDate, packagingCost, commission, courierPartner, logisticsDispatchDate,
    trackingId, freightCharges, logisticsStatus, podFilename, ewayBillFilename, remarks, warranty,
    invoiceNumber, invoiceDate, invoiceFilename, buyerAddress, platform,
  } = body;

  const reqPlatform = firmName || platform;
  if (reqPlatform) {
    const [compRows] = await mysqlPool.query("SELECT allowedPlatforms FROM companies WHERE guid = ?", [user.companyId]);
    if (compRows.length > 0 && compRows[0].allowedPlatforms) {
      const allowed = typeof compRows[0].allowedPlatforms === 'string' 
        ? JSON.parse(compRows[0].allowedPlatforms) 
        : compRows[0].allowedPlatforms;
      if (Array.isArray(allowed) && !allowed.includes(reqPlatform)) {
        return NextResponse.json({ message: `Platform "${reqPlatform}" is not allowed for this company.` }, { status: 400 });
      }
    }
  }

  const safeCustomerName = safeStr(customerName || customer, "");

  if (safeCustomerName && safeCustomerName.toLowerCase() !== "n/a") {
    const [existing] = await mysqlPool.query(
      "SELECT guid FROM orders WHERE (orderid = ? OR customerName = ?) AND isDeleted = 0 AND companyGuid = ? LIMIT 1",
      [safeCustomerName, safeCustomerName, user.companyId]
    );
    if (existing.length > 0) {
      return NextResponse.json({ message: `Order ID "${safeCustomerName}" already exists in the system.` }, { status: 400 });
    }
  }

  const safeAddress = safeStr(address || shippingAddress, null);
  const safeShippingAddress = safeStr(shippingAddress || address, null);
  const finalStatus = normalizeBusinessStatus(status);
  const finalLogisticsStatus = normalizeLogisticsStatus(logisticsStatus);
  const installReqBit = toBit(installationRequired) ? "Yes" : "No";
  const installStatusBit = toBit(installationRequired) ? (installationStatus || "Pending") : null;

  const connection = await mysqlPool.getConnection();
  let result, dispatchGuid, orderGuidForUpdate;
  try {
    await connection.beginTransaction();
    const createFn = nonSerialized ? createNonSerializedDispatchInline : createDispatchInline;
    result = await createFn(connection, {
      companyGuid: user.companyId,
      serialId, modelGuid, itemVariantId, quantity, firmName, customerName: safeCustomerName,
      address: safeAddress, shippingAddress: safeShippingAddress,
      user: bodyUser || "System", sellingPrice, status: finalStatus,
      orderVerified: orderVerified || "No", gemOrderType, bidNumber,
      orderDate, lastDeliveryDate, gstNumber, contactNumber, altContactNumber,
      buyerEmail, consigneeEmail, paymentAuthorityEmail: body.paymentAuthorityEmail,
      consigneeName, contractFilename: contractFilename || body.contractFile,
      installationRequired: installReqBit, installationStatus: installStatusBit,
      technicianName, technicianContact, installationCharges,
      installationRemarks, scheduledDate, packagingCost, commission,
      courierPartner, logisticsDispatchDate, trackingId,
      freightCharges, logisticsStatus: finalLogisticsStatus, podFilename, ewayBillFilename,
      remarks, warranty, buyerAddress,
      platformFields: body.platformFields ? JSON.stringify(body.platformFields) : null,
    });

    if (!result.success) {
      await connection.rollback();
      return NextResponse.json({ message: result.message }, { status: 400 });
    }

    dispatchGuid = result.dispatchGuid;
    orderGuidForUpdate = result.orderId;

    if (body.paymentAuthorityEmail || invoiceNumber || invoiceDate || invoiceFilename) {
      let updateQ = "UPDATE orders SET ";
      let updateParams = [];
      if (body.paymentAuthorityEmail) { updateQ += "paymentAuthorityEmail = ?, "; updateParams.push(body.paymentAuthorityEmail); }
      if (invoiceNumber) { updateQ += "invoiceNumber = ?, "; updateParams.push(invoiceNumber); }
      if (invoiceDate) { updateQ += "invoiceDate = ?, "; updateParams.push(safeDate(invoiceDate)); }
      if (invoiceFilename) { updateQ += "invoiceFilename = ?, "; updateParams.push(invoiceFilename); }
      if (updateParams.length > 0) {
        updateQ = updateQ.slice(0, -2) + " WHERE guid = ? AND companyGuid = ?";
        updateParams.push(orderGuidForUpdate, user.companyId);
        await connection.query(updateQ, updateParams);
      }
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  try {
    const displayOrderId = safeCustomerName && safeCustomerName.toLowerCase() !== "n/a" ? safeCustomerName : "TEMP";
    await createNotification(mysqlPool, {
      targetRole: "Admin",
      title: "New Dispatch Created",
      message: `A new dispatch order ${displayOrderId} has been created by ${bodyUser || "System"}.`,
      type: "success",
      link: "/dispatch",
      companyGuid: user.companyId,
    });
  } catch (notifErr) {
    console.error("Error sending new order notification:", notifErr);
  }

  broadcastRealtimeEvent(user.companyId, "dispatches");
  return NextResponse.json({ message: "Dispatched successfully", dispatchGuid }, { status: 201 });
});

export const PUT = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeDispatchRequest(user, "PUT", body);

  const { updates } = body;
  if (!Array.isArray(updates)) {
    return NextResponse.json({ message: "updates must be an array" }, { status: 400 });
  }

  const results = { success: [], failed: [] };
  for (const update of updates) {
    try {
      const { id, ...fields } = update;
      if (!id) { results.failed.push("unknown"); continue; }
      await updateDispatchItem(mysqlPool, id, fields, user?.username, user.companyId);
      results.success.push(id);
    } catch (err) {
      console.error("Bulk update item failed:", update?.id, err.message);
      results.failed.push(update.id || "unknown");
    }
  }
  if (results.success.length > 0) broadcastRealtimeEvent(user.companyId, "dispatches");
  return NextResponse.json({ message: "Bulk update completed", results });
});

export const DELETE = withErrorHandling(async (request) => {
  const body = await parseJsonBody(request);
  const user = await authenticateRequest(request);
  requireCompany(user);
  authorizeDispatchRequest(user, "DELETE", body);

  const { ids, reason, cancelledBy } = body;
  const idArray = Array.isArray(ids) ? ids : [ids];
  const results = { success: [], failed: [], errors: {} };
  const actor = cancelledBy || user?.username || "Unknown";
  const deleteReason = reason || "No reason";

  for (const id of idArray) {
    if (!id) { results.failed.push(id); results.errors[id] = "No ID provided"; continue; }

    const conn = await mysqlPool.getConnection();
    try {
      const [[item]] = await conn.query(
        "SELECT oi.guid, oi.orderGuid, oi.serialNumberGuid, s.serialNumber as serialValue, o.platform, o.orderid FROM order_items oi LEFT JOIN inventorystockinserial s ON oi.serialNumberGuid=s.guid AND s.companyGuid=? LEFT JOIN orders o ON oi.orderGuid=o.guid AND o.companyGuid=? WHERE oi.guid=? AND oi.companyGuid=? LIMIT 1",
        [user.companyId, user.companyId, id, user.companyId]
      );
      if (!item) {
        results.failed.push(id);
        results.errors[id] = "Dispatch Item not found";
        conn.release();
        continue;
      }

      await conn.beginTransaction();

      if (item.serialNumberGuid) {
        await conn.query("UPDATE inventorystockinserial SET serialStatus='Available' WHERE guid=? AND companyGuid=?", [item.serialNumberGuid, user.companyId]);
      }

      await conn.query("DELETE FROM payments WHERE dispatchGuid=? AND companyGuid=?", [id, user.companyId]);
      await conn.query("DELETE FROM orderdocuments WHERE dispatchGuid=? AND companyGuid=?", [id, user.companyId]);
      await conn.query("DELETE FROM order_items WHERE guid=? AND companyGuid=?", [id, user.companyId]);

      await conn.query(
        "INSERT INTO serialmovements (guid, serialNumberGuid, serialValue, dispatchGuid, actionType, status, platform, orderid, createdBy, notes, createdAt, companyGuid) VALUES (UUID(),?,?,?,'Deleted','Available',?,?,?,?,NOW(),?)",
        [item.serialNumberGuid, item.serialValue || "", id, item.platform || "", item.orderid || "", actor, `Removed from order: ${deleteReason}`, user.companyId]
      );

      const [[{ remaining }]] = await conn.query("SELECT COUNT(*) as remaining FROM order_items WHERE orderGuid=? AND companyGuid=?", [item.orderGuid, user.companyId]);
      if (remaining === 0) {
        await conn.query(
          "UPDATE orders SET isDeleted=1, status='Order Cancelled', cancellationReason=?, cancelledBy=?, cancelledAt=NOW() WHERE guid=? AND companyGuid=?",
          [deleteReason, actor, item.orderGuid, user.companyId]
        );
      }

      await conn.commit();
      results.success.push(id);
    } catch (txErr) {
      await conn.rollback();
      results.failed.push(id);
      results.errors[id] = txErr.message;
    } finally {
      conn.release();
    }
  }
  if (results.success.length > 0) broadcastRealtimeEvent(user.companyId, "dispatches");
  return NextResponse.json({ message: "Deletion completed", results });
});
