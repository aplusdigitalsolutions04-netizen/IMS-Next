import { randomUUID } from "crypto";
import { safeStr, safeDate, toBit, normalizeBusinessStatus, normalizeLogisticsStatus } from "@/lib/helpers";
import { handleOrderUpdates, createNotification } from "@/lib/notifications";

// Ported verbatim from Backend4/dispatchRoutes.js's `createDispatchInline` —
// inline replacement for sp_dispatch_create_v2 (avoids stored-procedure collation issues).
export async function createDispatchInline(conn, p) {
  const [serialRows] = await conn.query(
    "SELECT serialStatus, serialNumber, modelGuid, itemVariantId FROM inventorystockinserial WHERE guid = ? AND companyGuid = ? FOR UPDATE",
    [p.serialId, p.companyGuid]
  );
  if (!serialRows.length) return { success: false, message: "Serial not found" };
  if (serialRows[0].serialStatus !== "Available") return { success: false, message: "Serial is not available" };

  const serialValue = serialRows[0].serialNumber;
  const modelGuid = serialRows[0].modelGuid;
  const itemVariantId = serialRows[0].itemVariantId;

  await conn.query("UPDATE inventorystockinserial SET serialStatus = 'Dispatched' WHERE guid = ? AND companyGuid = ?", [p.serialId, p.companyGuid]);

  const safeCustomer = safeStr(p.customerName, "") || "";
  const safeOrderId = safeCustomer || `TEMP-${Date.now()}`;
  let orderId = null;

  // The dedup check below isn't backed by a DB unique constraint (it OR-matches
  // on either orderid or customerName, which isn't expressible as one) and
  // `SELECT ... FOR UPDATE` can't lock a row that doesn't exist yet — so two
  // concurrent dispatches for the same new customer/order could both see "no
  // existing order" and both INSERT, creating duplicate `orders` rows that
  // corrupt downstream payment/return rollups. A session-scoped named lock
  // keyed on the same identifier serializes concurrent attempts for that
  // specific order without needing a schema migration.
  const lockKey = `dispatch_order:${p.companyGuid}:${safeOrderId}`;
  await conn.query("SELECT GET_LOCK(?, 10)", [lockKey]);
  try {
    const [orderRows] = await conn.query(
      "SELECT guid FROM orders WHERE (orderid = ? OR customerName = ?) AND isDeleted = 0 AND companyGuid = ? LIMIT 1",
      [safeOrderId, safeCustomer, p.companyGuid]
    );
    if (orderRows.length) {
      orderId = orderRows[0].guid;
    } else {
      orderId = randomUUID();
      await conn.query(
        `INSERT INTO orders
           (guid,companyGuid,orderid,platform,customerName,consigneeName,buyerEmail,consigneeEmail,
            paymentAuthorityEmail,address,shippingAddress,dispatchedBy,status,gemOrderType,
            bidNumber,orderDate,gstNumber,contactNumber,altContactNumber,orderVerified,
            packagingCost,commission,freightCharges,remarks,dispatchDate,buyerAddress)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?)`,
        [orderId, p.companyGuid, safeOrderId, p.firmName, safeCustomer, p.consigneeName || null, p.buyerEmail || null,
          p.consigneeEmail || null, p.paymentAuthorityEmail || null, p.address || null, p.shippingAddress || null,
          p.user || "System", normalizeBusinessStatus(p.status || "Pending"), p.gemOrderType || null,
          p.bidNumber || null, safeDate(p.orderDate), p.gstNumber || null, p.contactNumber || null,
          p.altContactNumber || null, p.orderVerified || "No", p.packagingCost || 0, p.commission || 0,
          p.freightCharges || 0, p.remarks || null, p.buyerAddress || null]
      );
      await conn.query(
        `INSERT INTO order_logistics
           (orderGuid,companyGuid,courierPartner,trackingId,logisticsStatus,logisticsDispatchDate,podFilename,lastDeliveryDate)
         VALUES (?,?,?,?,?,?,?,?)`,
        [orderId, p.companyGuid, p.courierPartner || null, p.trackingId || null,
          normalizeLogisticsStatus(p.logisticsStatus), safeDate(p.logisticsDispatchDate),
          p.podFilename || null, safeDate(p.lastDeliveryDate)]
      );
      await conn.query(
        `INSERT INTO order_installations
           (orderGuid,companyGuid,installationRequired,installationStatus,technicianName,technicianContact,
            installationCharges,installationRemarks,scheduledDate)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [orderId, p.companyGuid, p.installationRequired || "No", p.installationStatus || null,
          p.technicianName || null, p.technicianContact || null,
          p.installationCharges || 0, p.installationRemarks || null, safeDate(p.scheduledDate)]
      );
    }
  } finally {
    await conn.query("SELECT RELEASE_LOCK(?)", [lockKey]);
  }

  const dispatchGuid = randomUUID();
  await conn.query(
    `INSERT INTO order_items
       (guid,companyGuid,orderGuid,serialNumberGuid,modelGuid,itemVariantId,sellingPrice,warranty,contractFilename)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [dispatchGuid, p.companyGuid, orderId, p.serialId, modelGuid, itemVariantId,
      p.sellingPrice || 0, p.warranty || null, p.contractFilename || null]
  );

  await conn.query(
    `INSERT INTO serialmovements
       (guid,companyGuid,serialNumberGuid,serialValue,dispatchGuid,actionType,status,
        platform,orderid,createdBy,notes,createdAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())`,
    [randomUUID(), p.companyGuid, p.serialId, serialValue, dispatchGuid,
      "Dispatched", "Dispatched", p.firmName || null, safeOrderId,
      p.user || "System", `Assigned to order #${orderId} as item #${dispatchGuid}`]
  );

  return { success: true, message: "Success", dispatchGuid, orderId };
}

// Same order-creation shape as createDispatchInline, but for a non-serialized
// item picked from Item Master (inventoryitemvariant / inventoryvariantstock —
// the same catalog Stationery stock-out uses) instead of the printer Models
// catalog: decrements inventoryvariantstock.availablePCS by p.quantity
// (following combo-mapping the same way SaveStockOut does) instead of pinning
// a specific serial, and writes a single order_item carrying that quantity
// (with itemVariantId set directly, plus a human-readable label in `remarks`).
export async function createNonSerializedDispatchInline(conn, p) {
  const [variantRows] = await conn.query(
    "SELECT v.itemVariantId, v.variantName, i.itemName FROM inventoryitemvariant v JOIN inventoryitemmaster i ON v.itemId = i.itemId WHERE v.itemVariantId = ? AND v.isDeleted = 0",
    [p.itemVariantId]
  );
  if (!variantRows.length) return { success: false, message: "Item not found" };
  const quantity = Number(p.quantity) || 1;
  const itemLabel = `${variantRows[0].itemName} — ${variantRows[0].variantName}`;

  const [comboComponents] = await conn.query(
    "SELECT childVariantId, quantity FROM inventorycombomapping WHERE parentVariantId = ? AND isDeleted = 0",
    [p.itemVariantId]
  );

  if (comboComponents.length > 0) {
    for (const comp of comboComponents) {
      const totalChildQty = comp.quantity * quantity;
      const [result] = await conn.query(
        "UPDATE inventoryvariantstock SET availablePCS = availablePCS - ? WHERE itemVariantId = ? AND availablePCS >= ?",
        [totalChildQty, comp.childVariantId, totalChildQty]
      );
      if (result.affectedRows === 0) {
        const [[stockRow]] = await conn.query("SELECT availablePCS FROM inventoryvariantstock WHERE itemVariantId = ?", [comp.childVariantId]);
        return { success: false, message: stockRow ? `Not enough stock for combo component — have ${stockRow.availablePCS}, need ${totalChildQty}` : "Stock record not found for combo component" };
      }
    }
  } else {
    const [result] = await conn.query(
      "UPDATE inventoryvariantstock SET availablePCS = availablePCS - ? WHERE itemVariantId = ? AND availablePCS >= ?",
      [quantity, p.itemVariantId, quantity]
    );
    if (result.affectedRows === 0) {
      const [[stockRow]] = await conn.query("SELECT availablePCS FROM inventoryvariantstock WHERE itemVariantId = ?", [p.itemVariantId]);
      return { success: false, message: stockRow ? `Not enough stock — only ${stockRow.availablePCS} available` : "Stock record not found for this item" };
    }
  }

  const safeCustomer = safeStr(p.customerName, "") || "";
  const safeOrderId = safeCustomer || `TEMP-${Date.now()}`;
  let orderId = null;

  // Same duplicate-order race and same fix as createDispatchInline above —
  // see the comment there for why a named lock instead of FOR UPDATE.
  const lockKey = `dispatch_order:${p.companyGuid}:${safeOrderId}`;
  await conn.query("SELECT GET_LOCK(?, 10)", [lockKey]);
  try {
    const [orderRows] = await conn.query(
      "SELECT guid FROM orders WHERE (orderid = ? OR customerName = ?) AND isDeleted = 0 AND companyGuid = ? LIMIT 1",
      [safeOrderId, safeCustomer, p.companyGuid]
    );
    if (orderRows.length) {
      orderId = orderRows[0].guid;
    } else {
      orderId = randomUUID();
      await conn.query(
        `INSERT INTO orders
           (guid,companyGuid,orderid,platform,customerName,consigneeName,buyerEmail,consigneeEmail,
            paymentAuthorityEmail,address,shippingAddress,dispatchedBy,status,gemOrderType,
            bidNumber,orderDate,gstNumber,contactNumber,altContactNumber,orderVerified,
            packagingCost,commission,freightCharges,remarks,dispatchDate,buyerAddress)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?)`,
        [orderId, p.companyGuid, safeOrderId, p.firmName, safeCustomer, p.consigneeName || null, p.buyerEmail || null,
          p.consigneeEmail || null, p.paymentAuthorityEmail || null, p.address || null, p.shippingAddress || null,
          p.user || "System", normalizeBusinessStatus(p.status || "Pending"), p.gemOrderType || null,
          p.bidNumber || null, safeDate(p.orderDate), p.gstNumber || null, p.contactNumber || null,
          p.altContactNumber || null, p.orderVerified || "No", p.packagingCost || 0, p.commission || 0,
          p.freightCharges || 0, p.remarks || null, p.buyerAddress || null]
      );
      await conn.query(
        `INSERT INTO order_logistics
           (orderGuid,companyGuid,courierPartner,trackingId,logisticsStatus,logisticsDispatchDate,podFilename,lastDeliveryDate)
         VALUES (?,?,?,?,?,?,?,?)`,
        [orderId, p.companyGuid, p.courierPartner || null, p.trackingId || null,
          normalizeLogisticsStatus(p.logisticsStatus), safeDate(p.logisticsDispatchDate),
          p.podFilename || null, safeDate(p.lastDeliveryDate)]
      );
      await conn.query(
        `INSERT INTO order_installations
           (orderGuid,companyGuid,installationRequired,installationStatus,technicianName,technicianContact,
            installationCharges,installationRemarks,scheduledDate)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [orderId, p.companyGuid, p.installationRequired || "No", p.installationStatus || null,
          p.technicianName || null, p.technicianContact || null,
          p.installationCharges || 0, p.installationRemarks || null, safeDate(p.scheduledDate)]
      );
    }
  } finally {
    await conn.query("SELECT RELEASE_LOCK(?)", [lockKey]);
  }

  const dispatchGuid = randomUUID();
  await conn.query(
    `INSERT INTO order_items
       (guid,companyGuid,orderGuid,itemVariantId,sellingPrice,quantity,warranty,contractFilename,remarks)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [dispatchGuid, p.companyGuid, orderId, p.itemVariantId,
      p.sellingPrice || 0, quantity, p.warranty || null, p.contractFilename || null, itemLabel]
  );

  return { success: true, message: "Success", dispatchGuid, orderId };
}

// Ported verbatim from Backend4/dispatchRoutes.js's `updateDispatchItem` —
// merges partial `fields` onto the current row, then calls sp_dispatch_update_v2.
export async function updateDispatchItem(pool, itemId, fields, user, companyGuid) {
  const [currentRows] = await pool.query(`
    SELECT
        oi.guid as id, oi.serialNumberGuid as serialGuid, oi.modelGuid, oi.sellingPrice, oi.warranty, oi.quantity, oi.contractFilename, oi.warrantyStartDate as itemWarrantyStartDate,
        o.guid as _orderId, o.orderid, o.platform, o.orderDate, o.dispatchDate, o.dispatchedBy, o.status,
        o.gemOrderType, o.bidNumber, o.customerName as customer, o.consigneeName, o.buyerEmail, o.consigneeEmail,
        o.paymentAuthorityEmail,
        o.shippingAddress, o.address, o.buyerAddress, o.gstNumber, o.contactNumber, o.altContactNumber, o.invoiceNumber,
        o.invoiceDate, o.warrantyStartDate, o.invoiceFilename, o.ewayBillNumber, o.ewayBillFilename, o.gemBillUploaded, o.freightCharges,
        o.packagingCost, o.commission, o.orderVerified, o.remarks, o.cancellationReason as cancelReason,
        o.cancelledBy, o.cancelledAt, o.isDeleted, o.rowColor, o.tags,
        ol.courierPartner, ol.trackingId, ol.logisticsStatus, ol.logisticsDispatchDate, ol.podFilename, ol.lastDeliveryDate,
        ins.installationRequired, ins.installationStatus, ins.technicianName, ins.technicianContact,
        ins.installationCharges, ins.installationRemarks, ins.scheduledDate, ins.installationDate
    FROM order_items oi
    JOIN orders o ON oi.orderGuid = o.guid
    LEFT JOIN order_logistics ol ON o.guid = ol.orderGuid
    LEFT JOIN order_installations ins ON o.guid = ins.orderGuid
    WHERE oi.guid = ? AND oi.companyGuid = ? AND o.companyGuid = ?
  `, [itemId, companyGuid, companyGuid]);

  if (currentRows.length === 0) {
    throw new Error("Dispatch item not found");
  }

  const current = currentRows[0];

  const merged = {
    serialId: fields.serialId !== undefined ? fields.serialId : (fields.serialGuid !== undefined ? fields.serialGuid : current.serialGuid),
    firmName: fields.firmName || fields.platform || current.platform || current.firmName,
    customerName: fields.customerName || fields.customer || current.customer || current.customerName,
    address: fields.address !== undefined ? fields.address : current.address,
    shippingAddress: fields.shippingAddress !== undefined ? fields.shippingAddress : current.shippingAddress,
    user: user || fields.user || fields.dispatchedBy || current.dispatchedBy || "System",
    sellingPrice: fields.sellingPrice !== undefined ? fields.sellingPrice : current.sellingPrice,
    status: fields.status !== undefined ? fields.status : current.status,
    dispatchDate: fields.dispatchDate !== undefined ? fields.dispatchDate : current.dispatchDate,
    courierPartner: fields.courierPartner !== undefined ? fields.courierPartner : current.courierPartner,
    logisticsDispatchDate: fields.logisticsDispatchDate !== undefined ? fields.logisticsDispatchDate : current.logisticsDispatchDate,
    trackingId: fields.trackingId !== undefined ? fields.trackingId : current.trackingId,
    freightCharges: fields.freightCharges !== undefined ? fields.freightCharges : current.freightCharges,
    logisticsStatus: fields.logisticsStatus !== undefined ? fields.logisticsStatus : current.logisticsStatus,
    podFilename: fields.podFilename !== undefined ? fields.podFilename : current.podFilename,
    invoiceNumber: fields.invoiceNumber !== undefined ? fields.invoiceNumber : current.invoiceNumber,
    ewayBillNumber: fields.ewayBillNumber !== undefined ? fields.ewayBillNumber : current.ewayBillNumber,
    gemBillUploaded: fields.gemBillUploaded !== undefined ? fields.gemBillUploaded : current.gemBillUploaded,
    invoiceFilename: fields.invoiceFilename !== undefined ? fields.invoiceFilename : current.invoiceFilename,
    installationRequired: fields.installationRequired !== undefined ? fields.installationRequired : current.installationRequired,
    installationStatus: fields.installationStatus !== undefined ? fields.installationStatus : current.installationStatus,
    technicianName: fields.technicianName !== undefined ? fields.technicianName : current.technicianName,
    technicianContact: fields.technicianContact !== undefined ? fields.technicianContact : current.technicianContact,
    installationCharges: fields.installationCharges !== undefined ? fields.installationCharges : current.installationCharges,
    installationRemarks: fields.installationRemarks !== undefined ? fields.installationRemarks : current.installationRemarks,
    scheduledDate: fields.scheduledDate !== undefined ? fields.scheduledDate : current.scheduledDate,
    installationDate: fields.installationDate !== undefined ? fields.installationDate : current.installationDate,
    packagingCost: fields.packagingCost !== undefined ? fields.packagingCost : current.packagingCost,
    commission: fields.commission !== undefined ? fields.commission : current.commission,
    ewayBillFilename: fields.ewayBillFilename !== undefined ? fields.ewayBillFilename : current.ewayBillFilename,
    contactNumber: fields.contactNumber !== undefined ? fields.contactNumber : current.contactNumber,
    altContactNumber: fields.altContactNumber !== undefined ? fields.altContactNumber : current.altContactNumber,
    buyerEmail: fields.buyerEmail !== undefined ? fields.buyerEmail : current.buyerEmail,
    consigneeEmail: fields.consigneeEmail !== undefined ? fields.consigneeEmail : current.consigneeEmail,
    consigneeName: fields.consigneeName !== undefined ? fields.consigneeName : current.consigneeName,
    gstNumber: fields.gstNumber !== undefined ? fields.gstNumber : current.gstNumber,
    contractFilename: fields.contractFilename !== undefined ? fields.contractFilename : (fields.contractFile !== undefined ? fields.contractFile : current.contractFilename),
    remarks: fields.remarks !== undefined ? fields.remarks : current.remarks,
    warranty: fields.warranty !== undefined ? fields.warranty : current.warranty,
    lastDeliveryDate: fields.lastDeliveryDate !== undefined ? fields.lastDeliveryDate : current.lastDeliveryDate,
    buyerAddress: fields.buyerAddress !== undefined ? fields.buyerAddress : current.buyerAddress,
  };

  const finalStatus = normalizeBusinessStatus(merged.status);
  const finalLogisticsStatus = normalizeLogisticsStatus(merged.logisticsStatus);
  const installReqBit = toBit(merged.installationRequired) ? "Yes" : "No";
  const installStatusBit = toBit(merged.installationRequired) ? (merged.installationStatus || "Pending") : null;

  await pool.query("SET @resultMsg = '';");
  await pool.query(`
    CALL sp_dispatch_update_v2(
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      @resultMsg
    )
  `, [
    itemId,
    merged.serialId,
    merged.firmName,
    merged.customerName,
    safeStr(merged.address),
    safeStr(merged.shippingAddress),
    merged.user,
    merged.sellingPrice || 0,
    finalStatus,
    safeDate(merged.dispatchDate),
    merged.courierPartner || null,
    safeDate(merged.logisticsDispatchDate),
    merged.trackingId || null,
    merged.freightCharges || 0,
    finalLogisticsStatus,
    merged.podFilename || null,
    merged.invoiceNumber || null,
    merged.ewayBillNumber || null,
    merged.gemBillUploaded || "No",
    merged.invoiceFilename || null,
    installReqBit,
    installStatusBit,
    merged.technicianName || null,
    merged.technicianContact || null,
    merged.installationCharges || 0,
    merged.installationRemarks || null,
    safeDate(merged.scheduledDate),
    safeDate(merged.installationDate),
    merged.packagingCost || 0,
    merged.commission || 0,
    merged.ewayBillFilename || null,
    merged.contactNumber || null,
    merged.altContactNumber || null,
    merged.buyerEmail || null,
    merged.consigneeEmail || null,
    merged.paymentAuthorityEmail || null,
    merged.consigneeName || null,
    merged.gstNumber || null,
    merged.contractFilename || null,
    merged.remarks || null,
    merged.warranty || null,
    safeDate(merged.lastDeliveryDate),
    safeStr(merged.buyerAddress),
  ]);

  const [outParams] = await pool.query("SELECT @resultMsg as message");
  if (outParams[0].message !== "Success") {
    throw new Error(outParams[0].message);
  }

  let updateQ = "UPDATE orders SET ";
  let updateParams = [];
  if (fields.paymentAuthorityEmail !== undefined) { updateQ += "paymentAuthorityEmail = ?, "; updateParams.push(fields.paymentAuthorityEmail); }
  if (fields.invoiceNumber !== undefined) { updateQ += "invoiceNumber = ?, "; updateParams.push(fields.invoiceNumber); }
  if (fields.invoiceDate !== undefined) { updateQ += "invoiceDate = ?, "; updateParams.push(safeDate(fields.invoiceDate)); }
  if (fields.warrantyStartDate !== undefined) { updateQ += "warrantyStartDate = ?, "; updateParams.push(safeDate(fields.warrantyStartDate) || null); }
  if (fields.buyerAddress !== undefined) { updateQ += "buyerAddress = ?, "; updateParams.push(fields.buyerAddress); }

  if (updateParams.length > 0) {
    updateQ = updateQ.slice(0, -2) + " WHERE guid = ? AND companyGuid = ?";
    updateParams.push(current._orderId, companyGuid);
    await pool.query(updateQ, updateParams);
  }

  try {
    await handleOrderUpdates(pool, current, merged, itemId);
  } catch (notifErr) {
    console.error("Error sending order updates notifications:", notifErr);
  }
}

// Reminds Admin/creator once a day when a GeM order's bill hasn't been uploaded
// on the GeM portal and its Last Delivery Date is within the next 3 days.
export async function notifyPendingGemUploads(pool) {
  try {
    const [rows] = await pool.query(`
      SELECT o.guid, o.companyGuid, o.orderid, o.dispatchedBy, ol.lastDeliveryDate
      FROM orders o
      JOIN order_logistics ol ON o.guid = ol.orderGuid AND ol.companyGuid = o.companyGuid
      WHERE o.platform = 'GeM'
        AND o.isDeleted = 0
        AND (o.gemBillUploaded IS NULL OR o.gemBillUploaded != 'Yes')
        AND o.status NOT IN ('Order Cancelled', 'Completed')
        AND ol.lastDeliveryDate IS NOT NULL
        AND DATEDIFF(ol.lastDeliveryDate, CURDATE()) BETWEEN 0 AND 3
    `);
    if (rows.length === 0) return;

    const [alreadyNotified] = await pool.query(
      `SELECT link FROM notifications WHERE type = 'gem-upload-reminder' AND DATE(createdAt) = CURDATE()`
    );
    const notifiedOrderGuids = new Set(alreadyNotified.map((n) => n.link));

    for (const row of rows) {
      if (notifiedOrderGuids.has(row.guid)) continue;

      let creatorGuid = null;
      if (row.dispatchedBy) {
        const [creatorRows] = await pool.query("SELECT userid FROM users WHERE username = ?", [row.dispatchedBy]);
        if (creatorRows.length > 0) creatorGuid = String(creatorRows[0].userid);
      }

      const deliveryDateStr = new Date(row.lastDeliveryDate).toLocaleDateString("en-IN");
      await createNotification(pool, {
        targetRole: "Admin",
        targetUserGuid: creatorGuid,
        title: "GeM Bill Upload Pending",
        message: `Order ${row.orderid}'s bill has not been uploaded on GeM yet. Last Delivery Date: ${deliveryDateStr}. Please upload it soon.`,
        type: "gem-upload-reminder",
        priority: "high",
        link: row.guid,
        companyGuid: row.companyGuid,
      });
    }
  } catch (err) {
    console.error("notifyPendingGemUploads failed:", err.message);
  }
}
