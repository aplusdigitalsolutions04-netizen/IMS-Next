"use client";

import api, { toTrimmedString, toNullableString, toNullableNumber, collapseDuplicateColumnValue } from "@/lib/client/apiClient";

export const returnsService = {
  getReturns: async (companyGuid) => {
    try {
      const cg = companyGuid ? `&companyGuid=${encodeURIComponent(companyGuid)}` : "";
      const res = await api.get(`/returns?_t=${new Date().getTime()}${cg}`);
      const rows = Array.isArray(res.data) ? res.data : [];
      return rows.map((item) => ({
        ...item,
        serialValue: toTrimmedString(collapseDuplicateColumnValue(item.serialValue), ""),
        firmName: toNullableString(collapseDuplicateColumnValue(item.firmName)),
        customerName: toNullableString(collapseDuplicateColumnValue(item.customerName)),
        invoiceNumber: toNullableString(collapseDuplicateColumnValue(item.invoiceNumber)),
      }));
    } catch (error) {
      console.error("Failed to fetch returns:", error.message);
      return [];
    }
  },

  getReturnLookup: async (serialValue) => {
    const trimmedSerial = toTrimmedString(serialValue);
    if (!trimmedSerial) throw new Error("Serial number is required");
    const res = await api.get("/returns/lookup", {
      params: { serialValue: trimmedSerial, _t: new Date().getTime() },
    });
    return res.data;
  },

  getSerialHistory: async (serialId) => {
    const safeId = toNullableNumber(serialId);
    if (!safeId) throw new Error("Serial ID is required");
    const res = await api.get(`/serials/${safeId}/history?_t=${new Date().getTime()}`);
    return res.data;
  },

  addReturn: async (data, conditionParam, reasonParam) => {
    let payload;
    if (typeof data === "object" && data !== null && !conditionParam) {
      payload = {
        serialValue: (data.serialValue || data.serialNumber || data.serial)?.toString().trim(),
        condition: data.condition || "Good",
        reason: (data.reason || data.remarks || "")?.toString().trim(),
        dispatchId: data.dispatchId || null,
        returnDate: data.returnDate || new Date().toISOString(),
        returnedBy: data.returnedBy || data.user || "Unknown",
        itemVariantId: data.itemVariantId || null,
        quantity: data.quantity || 1,
        isInventoryItem: data.isInventoryItem || false,
        // Was silently dropped here before — Returns.jsx's condition modal
        // collects these, but this payload builder never forwarded them, so
        // every return saved with no refund info and the list always showed
        // ₹0 regardless of what was entered.
        refundStatus: data.refundStatus || null,
        refundAmount: data.refundAmount === undefined || data.refundAmount === null || data.refundAmount === "" ? null : Number(data.refundAmount),
      };
    } else {
      payload = {
        serialValue: data?.toString().trim(),
        condition: conditionParam || "Good",
        reason: (reasonParam || "")?.toString().trim(),
        returnDate: new Date().toISOString(),
        returnedBy: "Unknown",
        quantity: 1,
      };
    }
    if (!payload.serialValue && !payload.itemVariantId) throw new Error("Serial number or Item Variant is required for return");
    if (!payload.reason) throw new Error("Return reason is required");
    const validConditions = ["Good", "InStock", "Damaged", "Defective", "Refurbished", "Other"];
    if (!validConditions.includes(payload.condition)) {
      payload.condition = "Good";
    }
    const res = await api.post("/returns", payload);
    return res.data;
  },

  updateReturn: async (id, data) => {
    if (!id) throw new Error("Return ID is required for update");
    const payload = {
      condition: data.condition,
      reason: data.reason?.trim() || data.remarks?.trim() || "",
      status: data.status,
      ...(data.restoredToStock !== undefined && { restoredToStock: data.restoredToStock }),
    };
    Object.keys(payload).forEach((key) => { if (payload[key] === undefined) delete payload[key]; });
    const res = await api.put(`/returns/${id}`, payload);
    return res.data;
  },

  // Deliberately separate from updateReturn (not just a thin wrapper) —
  // that function's payload always sends `reason` (falling back to ""
  // instead of omitting it), which would silently blank out the return's
  // reason on every refund-only edit. This sends only the two refund
  // fields, so editing refund info later never touches anything else.
  updateReturnRefund: async (id, { refundStatus, refundAmount }) => {
    if (!id) throw new Error("Return ID is required for update");
    const payload = {};
    if (refundStatus !== undefined) payload.refundStatus = refundStatus;
    if (refundAmount !== undefined) payload.refundAmount = refundAmount;
    const res = await api.put(`/returns/${id}`, payload);
    return res.data;
  },

  deleteReturn: async (item) => {
    let id = null;
    if (typeof item === "string" || typeof item === "number") {
      id = item;
    } else if (item && typeof item === "object") {
      id = item._id || item.id || item.returnId || item.return_id || item.Id || item.ID;
    }
    if (!id) {
      throw new Error("No valid ID found for this return record. Please refresh and try again.");
    }
    try {
      const res = await api.delete(`/returns/${id}`);
      return res.data;
    } catch (error) {
      if (error.response?.status === 404) throw new Error("Return record not found. It may have been already deleted.");
      throw error;
    }
  },

  restoreReturnToStock: async (id) => {
    if (!id) throw new Error("Return ID is required");
    const res = await api.post(`/returns/${id}/restore-to-stock`);
    return res.data;
  },

  getReturnById: async (id) => {
    if (!id) throw new Error("Return ID is required");
    const res = await api.get(`/returns/${id}?_t=${new Date().getTime()}`);
    return res.data;
  },

  getReturnStats: async () => {
    try {
      const res = await api.get(`/returns/stats?_t=${new Date().getTime()}`);
      return res.data;
    } catch (error) {
      console.warn("Failed to fetch return stats:", error.message);
      return { total: 0, good: 0, damaged: 0, defective: 0, restoredToStock: 0 };
    }
  },
};
