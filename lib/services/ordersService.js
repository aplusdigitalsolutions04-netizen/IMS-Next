"use client";

import api, { toTrimmedString, toNumber, toNullableString, normalizeDispatchStatus } from "@/lib/client/apiClient";

export const ordersService = {
  getOrders: async () => {
    try {
      const res = await api.get(`/orders?_t=${new Date().getTime()}`);
      return res.data;
    } catch (error) {
      console.warn("Error fetching orders:", error.message);
      return [];
    }
  },

  createOrderDraft: async (data) => {
    const res = await api.post("/orders/draft", data);
    return res.data;
  },

  confirmDraftOrder: async (orderId, items) => {
    const res = await api.post(`/orders/draft/${orderId}/confirm`, { items });
    return res.data;
  },

  sendDraftToBilling: async (orderId) => {
    const res = await api.post(`/orders/draft/${orderId}/send-to-billing`);
    return res.data;
  },

  updateDraftBilling: async (orderId, data) => {
    const res = await api.patch(`/orders/draft/${orderId}/billing`, data);
    return res.data;
  },

  updateOrderStatus: async (id, statusData) => {
    const payload = {
      status: normalizeDispatchStatus(statusData.status),
      trackingId: toTrimmedString(statusData.trackingId, ""),
      reason: toNullableString(statusData.reason),
    };
    const res = await api.put(`/orders/${id}/status`, payload);
    return res.data;
  },

  updatePayment: async (id, paymentData) => {
    const payload = {
      paymentDate: paymentData.paymentDate,
      amount: toNumber(paymentData.amount),
      utrId: toNullableString(paymentData.utrId),
      status: "Completed",
    };
    const res = await api.put(`/orders/${id}/payment`, payload);
    return res.data;
  },

  replaceOrder: async (id, data) => {
    const payload = {
      oldSerialValue: toTrimmedString(data.oldSerialValue),
      newSerialId: data.newSerialId,
      newSerialValue: toTrimmedString(data.newSerialValue),
      reason: toNullableString(data.reason),
    };
    const res = await api.post(`/orders/${id}/replace`, payload);
    return res.data;
  },

  addOrderItem: async (orderGuid, data) => {
    const payload = {
      newSerialId: data.newSerialId,
      sellingPrice: toNumber(data.sellingPrice),
      warranty: toNullableString(data.warranty),
      addedBy: toNullableString(data.addedBy),
    };
    const res = await api.post(`/orders/${orderGuid}/items`, payload);
    return res.data;
  },

  uploadOrderDocument: async (id, file, docType) => {
    if (!id) throw new Error("Order item ID is required for document upload");
    if (!file) throw new Error("File is required for document upload");
    if (!(file instanceof File)) throw new Error("Invalid file selected for document upload");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("docType", docType);
    const res = await api.post(`/orders/${id}/upload`, formData, {
      timeout: 60000,
      headers: { "Content-Type": undefined },
    });
    return res.data;
  },

  deleteOrderDocument: async (filename) => {
    const res = await api.delete(`/orders/documents`, { data: { filename } });
    return res.data;
  },

  updateItemWarrantyStart: async (itemId, warrantyStartDate) => {
    const res = await api.put(`/orders/${itemId}/warranty-start`, { warrantyStartDate });
    return res.data;
  },

  uploadEwayBill: async (dispatchId, file) => {
    if (!dispatchId) throw new Error("Dispatch ID is required for E-Way Bill upload");
    if (!file) throw new Error("File is required for E-Way Bill upload");
    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) throw new Error("Invalid file type. Only PDF, JPG, PNG, and WEBP are allowed for E-Way Bill.");
    if (file.size > 10 * 1024 * 1024) throw new Error("File size exceeds 10MB limit.");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("docType", "ewayBill");
    const res = await api.post(`/orders/${dispatchId}/upload`, formData);
    return res.data;
  },

  getEwayBillUrl: (filename) => {
    if (!filename) return null;
    return `/uploads/${filename}`;
  },

  validateEwayBillRequired: (orderValue) => {
    const threshold = 50000;
    const isRequired = Number(orderValue) > threshold;
    return {
      isRequired,
      threshold,
      message: isRequired ? `E-Way Bill is mandatory for orders above ₹${threshold.toLocaleString("en-IN")}` : null,
    };
  },
};
