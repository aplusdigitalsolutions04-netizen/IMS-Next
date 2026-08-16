"use client";

import api, {
  toTrimmedString, toNumber, toNullableString, toBoolean,
  normalizeDispatchStatus, normalizeLogisticsStatus,
} from "@/lib/client/apiClient";

export const dispatchService = {
  getDispatches: async (includeDeleted = true, companyGuid) => {
    try {
      const cg = companyGuid ? `&companyGuid=${encodeURIComponent(companyGuid)}` : "";
      const res = await api.get(`/dispatches?includeDeleted=${includeDeleted}&_t=${new Date().getTime()}${cg}`);
      return res.data;
    } catch (error) {
      console.warn("Failed to fetch dispatches:", error.message);
      return [];
    }
  },

  getDispatchById: async (id) => {
    try {
      const res = await api.get(`/dispatches/${id}?_t=${new Date().getTime()}`);
      return res.data;
    } catch (error) {
      console.warn(`Failed to fetch dispatch details for ID ${id}:`, error.message);
      return null;
    }
  },

  getDispatchStats: async () => {
    try {
      const res = await api.get(`/dispatches/stats?_t=${new Date().getTime()}`);
      return res.data;
    } catch (error) {
      console.warn("Failed to fetch dispatch stats:", error.message);
      return null;
    }
  },

  addDispatch: async (data) => {
    let safePackagingCost = null;
    if (data.packagingCost !== undefined && data.packagingCost !== "") {
      safePackagingCost = toNumber(data.packagingCost);
    }
    const normalizedStatus = normalizeDispatchStatus(data.status);
    const payload = {
      serialId: data.serialId,
      modelGuid: data.modelGuid || null,
      itemVariantId: data.itemVariantId || null,
      quantity: data.quantity ? toNumber(data.quantity) : undefined,
      nonSerialized: !!data.nonSerialized,
      firmName: toTrimmedString(data.firmName),
      customer: toTrimmedString(data.customer || data.customerName),
      customerName: toTrimmedString(data.customerName || data.customer),
      address: toTrimmedString(data.address || data.shippingAddress),
      shippingAddress: toTrimmedString(data.shippingAddress || data.address),
      user: data.user || data.dispatchedBy || "Unknown",
      sellingPrice: toNumber(data.sellingPrice),
      status: normalizedStatus,
      remarks: toTrimmedString(data.remarks, ""),
      orderVerified: data.orderVerified || "No",
      gemOrderType: data.orderType || data.gemOrderType || null,
      bidNumber: data.bidNumber || data.bidNo || null,
      orderDate: data.orderDate || null,
      lastDeliveryDate: data.lastDeliveryDate || null,
      gstNumber: toNullableString(data.gstNumber),
      contactNumber: toNullableString(data.contactNumber),
      altContactNumber: toNullableString(data.altContactNumber),
      buyerEmail: toNullableString(data.buyerEmail),
      consigneeEmail: toNullableString(data.consigneeEmail),
      consigneeName: toNullableString(data.consigneeName),
      contractFile: data.contractFile || data.contractFilename || null,
      invoiceNumber: toNullableString(data.invoiceNumber),
      invoiceDate: data.invoiceDate || null,
      invoiceFilename: data.invoiceFilename || null,
      installationRequired: toBoolean(data.installationRequired),
      installationStatus: toBoolean(data.installationRequired) ? data.installationStatus || "Pending" : null,
      technicianName: toNullableString(data.technicianName),
      technicianContact: toNullableString(data.technicianContact),
      installationCharges: toNumber(data.installationCharges),
      installationRemarks: toNullableString(data.installationRemarks),
      scheduledDate: data.scheduledDate || null,
      courierPartner: toNullableString(data.courierPartner),
      logisticsDispatchDate: data.logisticsDispatchDate || null,
      trackingId: toNullableString(data.trackingId),
      freightCharges: toNumber(data.freightCharges),
      logisticsStatus: normalizeLogisticsStatus(data.logisticsStatus),
      podFilename: data.podFilename || null,
      ewayBillFilename: data.ewayBillFilename || null,
      packagingCost: safePackagingCost,
      commission: toNumber(data.commission),
      warranty: data.warranty || null,
      platformFields: data.platformFields || null,
    };
    const res = await api.post("/dispatches", payload);
    return res.data;
  },

  addBulkDispatch: async (items) => {
    const safeItems = items.map((item) => {
      let safePackagingCost = null;
      if (item.packagingCost !== undefined && item.packagingCost !== "") {
        safePackagingCost = toNumber(item.packagingCost);
      }
      return {
        serialId: item.serialId,
        firmName: toTrimmedString(item.firmName),
        customer: toTrimmedString(item.customer || item.customerName),
        customerName: toTrimmedString(item.customerName || item.customer),
        address: toTrimmedString(item.address || item.shippingAddress),
        shippingAddress: toTrimmedString(item.shippingAddress || item.address),
        buyerAddress: toTrimmedString(item.buyerAddress || item.buyToAddress),
        user: item.user || "Unknown",
        sellingPrice: toNumber(item.sellingPrice),
        status: normalizeDispatchStatus(item.status || "Pending"),
        orderVerified: item.orderVerified || "No",
        gemOrderType: item.orderType || item.gemOrderType || null,
        bidNumber: item.bidNumber || item.bidNo || null,
        orderDate: item.orderDate || null,
        lastDeliveryDate: item.lastDeliveryDate || null,
        gstNumber: toNullableString(item.gstNumber),
        contactNumber: toNullableString(item.contactNumber),
        altContactNumber: toNullableString(item.altContactNumber),
        buyerEmail: toNullableString(item.buyerEmail),
        consigneeEmail: toNullableString(item.consigneeEmail),
        consigneeName: toNullableString(item.consigneeName),
        contractFile: item.contractFile || item.contractFilename || null,
        invoiceNumber: toNullableString(item.invoiceNumber),
        invoiceDate: item.invoiceDate || null,
        invoiceFilename: item.invoiceFilename || null,
        installationRequired: toBoolean(item.installationRequired),
        installationStatus: toBoolean(item.installationRequired) ? item.installationStatus || "Pending" : null,
        technicianName: toNullableString(item.technicianName),
        technicianContact: toNullableString(item.technicianContact),
        installationCharges: toNumber(item.installationCharges),
        installationRemarks: toNullableString(item.installationRemarks),
        scheduledDate: item.scheduledDate || null,
        courierPartner: toNullableString(item.courierPartner),
        logisticsDispatchDate: item.logisticsDispatchDate || null,
        trackingId: toNullableString(item.trackingId),
        freightCharges: toNumber(item.freightCharges),
        logisticsStatus: normalizeLogisticsStatus(item.logisticsStatus),
        podFilename: item.podFilename || null,
        ewayBillFilename: item.ewayBillFilename || null,
        packagingCost: safePackagingCost,
        commission: toNumber(item.commission),
        warranty: item.warranty || null,
        platformFields: item.platformFields || null,
      };
    });
    const res = await api.post("/dispatches/bulk", { items: safeItems });
    return res.data;
  },

  resetDocs: async (payload) => {
    const res = await api.put("/orders/bulk-reset-docs", payload);
    return res.data;
  },

  sendBackToBilling: async (payload) => {
    const res = await api.put("/orders/bulk-send-back", payload);
    return res.data;
  },

  updateDispatch: async (id, updates) => {
    if (!updates && !id) return null;

    if (!id && Array.isArray(updates)) {
      const normalizedUpdates = updates.map((item) => {
        const payload = { ...item };
        if (payload.status !== undefined) payload.status = normalizeDispatchStatus(payload.status);
        if (payload.logisticsStatus !== undefined) payload.logisticsStatus = normalizeLogisticsStatus(payload.logisticsStatus);
        if (payload.installationRequired !== undefined) {
          const val = payload.installationRequired;
          payload.installationRequired = val === true || val === "Yes" || val === "yes" || val === 1 || val === "1" ? "Yes" : "No";
        }
        if (payload.installationCharges !== undefined) payload.installationCharges = toNumber(payload.installationCharges);
        if (payload.packagingCost !== undefined) payload.packagingCost = toNumber(payload.packagingCost);
        if (payload.commission !== undefined) payload.commission = toNumber(payload.commission);
        if (payload.freightCharges !== undefined) payload.freightCharges = toNumber(payload.freightCharges);
        if (payload.sellingPrice !== undefined) payload.sellingPrice = toNumber(payload.sellingPrice);
        if (payload.buyerAddress !== undefined) payload.buyerAddress = toTrimmedString(payload.buyerAddress);
        if (payload.technicianName !== undefined) payload.technicianName = toNullableString(payload.technicianName);
        if (payload.technicianContact !== undefined) payload.technicianContact = toNullableString(payload.technicianContact);
        if (payload.installationRemarks !== undefined) payload.installationRemarks = toNullableString(payload.installationRemarks);
        if (payload.contactNumber !== undefined) payload.contactNumber = toNullableString(payload.contactNumber);
        if (payload.altContactNumber !== undefined) payload.altContactNumber = toNullableString(payload.altContactNumber);
        if (payload.buyerEmail !== undefined) payload.buyerEmail = toNullableString(payload.buyerEmail);
        if (payload.consigneeEmail !== undefined) payload.consigneeEmail = toNullableString(payload.consigneeEmail);
        if (payload.gstNumber !== undefined) payload.gstNumber = toNullableString(payload.gstNumber);
        if (payload.customer !== undefined || payload.customerName !== undefined) {
          payload.customer = toTrimmedString(payload.customer || payload.customerName);
          payload.customerName = toTrimmedString(payload.customerName || payload.customer);
        }
        if (payload.address !== undefined || payload.shippingAddress !== undefined) {
          payload.address = toTrimmedString(payload.address || payload.shippingAddress);
          payload.shippingAddress = toTrimmedString(payload.shippingAddress || payload.address);
        }
        return payload;
      });
      const res = await api.put("/dispatches", { updates: normalizedUpdates });
      return res.data;
    }

    const payload = { ...updates };
    if (payload.status !== undefined) payload.status = normalizeDispatchStatus(payload.status);
    if (payload.logisticsStatus !== undefined) payload.logisticsStatus = normalizeLogisticsStatus(payload.logisticsStatus);
    if (payload.installationRequired !== undefined) {
      const val = payload.installationRequired;
      payload.installationRequired = val === true || val === "Yes" || val === "yes" || val === 1 || val === "1" ? "Yes" : "No";
    }
    if (payload.installationCharges !== undefined) payload.installationCharges = toNumber(payload.installationCharges);
    if (payload.packagingCost !== undefined) payload.packagingCost = toNumber(payload.packagingCost);
    if (payload.commission !== undefined) payload.commission = toNumber(payload.commission);
    if (payload.freightCharges !== undefined) payload.freightCharges = toNumber(payload.freightCharges);
    if (payload.sellingPrice !== undefined) payload.sellingPrice = toNumber(payload.sellingPrice);
    if (payload.technicianName !== undefined) payload.technicianName = toNullableString(payload.technicianName);
    if (payload.technicianContact !== undefined) payload.technicianContact = toNullableString(payload.technicianContact);
    if (payload.installationRemarks !== undefined) payload.installationRemarks = toNullableString(payload.installationRemarks);
    if (payload.contactNumber !== undefined) payload.contactNumber = toNullableString(payload.contactNumber);
    if (payload.altContactNumber !== undefined) payload.altContactNumber = toNullableString(payload.altContactNumber);
    if (payload.buyerEmail !== undefined) payload.buyerEmail = toNullableString(payload.buyerEmail);
    if (payload.consigneeEmail !== undefined) payload.consigneeEmail = toNullableString(payload.consigneeEmail);
    if (payload.gstNumber !== undefined) payload.gstNumber = toNullableString(payload.gstNumber);
    if (payload.customer !== undefined || payload.customerName !== undefined) {
      payload.customer = toTrimmedString(payload.customer || payload.customerName);
      payload.customerName = toTrimmedString(payload.customerName || payload.customer);
    }
    if (payload.address !== undefined || payload.shippingAddress !== undefined) {
      payload.address = toTrimmedString(payload.address || payload.shippingAddress);
      payload.shippingAddress = toTrimmedString(payload.shippingAddress || payload.address);
    }

    if (id) {
      const res = await api.put(`/dispatches/${id}`, payload);
      return res.data;
    } else {
      const res = await api.put("/dispatches", { updates: payload });
      return res.data;
    }
  },

  updateTransaction: async (id, data) => dispatchService.updateDispatch(id, data),

  deleteDispatch: async (ids, reason, cancelledBy, clearCharges) => {
    const res = await api.delete("/dispatches", {
      data: {
        ids: Array.isArray(ids) ? ids : [ids],
        reason: reason || "No reason provided",
        cancelledBy: cancelledBy || "Unknown",
        clearCharges: !!clearCharges,
      },
    });
    return res.data;
  },

  restoreDispatch: async (ids) => {
    const res = await api.post("/dispatches/restore", {
      ids: Array.isArray(ids) ? ids : [ids],
    });
    return res.data;
  },

  permanentDeleteDispatch: async (ids) => {
    const res = await api.delete("/dispatches/permanent", {
      data: { ids: Array.isArray(ids) ? ids : [ids] },
    });
    return res.data;
  },
};
