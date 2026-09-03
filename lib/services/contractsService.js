"use client";

import api from "@/lib/client/apiClient";

export const contractsService = {
  getContracts: async () => {
    try {
      const res = await api.get(`/contracts?_t=${Date.now()}`);
      return res.data;
    } catch (error) {
      console.warn("Failed to fetch contracts:", error.message);
      return [];
    }
  },

  parseContractFile: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post("/contracts/parse", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  saveContract: async (data) => {
    const res = await api.post("/contracts", data);
    return res.data;
  },

  // Reverse flow: takes an order that already exists (created outside the
  // Contracts-upload flow, e.g. via NewDispatch) and saves it into the
  // Contracts list, using the order's items/details to fill the contract.
  // `replace` (Admin only) overwrites an already-saved contract for this
  // order instead of the API rejecting with 409.
  // Same AI-extraction-can-be-slow reasoning as saveOrdersAsContractBulk
  // below applies to a single order too (one PDF/vision extraction call is
  // enough to blow past the default 45s) — same generous timeout here.
  saveOrderAsContract: async (orderGuid, replace = false) => {
    const res = await api.post(`/orders/${orderGuid}/save-as-contract`, { replace }, { timeout: 90000 });
    return res.data;
  },

  // Bulk version for OrderTracking.jsx's multi-select "Save as Contract" —
  // returns { saved: [], skipped: [], failed: [] } so the caller can show a
  // one-line summary instead of a toast per order. Runs sequentially
  // server-side (see app/api/orders/save-as-contract-bulk/route.js) and each
  // order can trigger its own AI extraction call, so a handful of orders can
  // easily take longer than apiClient's default 45s timeout — the request
  // was timing out on the client and showing "failed" while the server kept
  // going and actually finished saving everything anyway. A generous
  // per-order-scaled timeout keeps the client waiting for the real result
  // instead of giving up early.
  saveOrdersAsContractBulk: async (orderGuids) => {
    const res = await api.post("/orders/save-as-contract-bulk", { orderGuids }, {
      timeout: Math.max(60000, orderGuids.length * 30000),
    });
    return res.data;
  },

  deleteContract: async (id) => {
    const res = await api.delete(`/contracts/${id}`);
    return res.data;
  },

  updateContract: async (id, data) => {
    const res = await api.put(`/contracts/${id}`, data);
    return res.data;
  },

  // For contracts saved without a PDF ever making it to Drive (e.g. a row
  // inserted directly into the DB rather than through Upload Contract) —
  // attaches/replaces the PDF on an existing contract.
  uploadContractPdf: async (id, file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.put(`/contracts/${id}/pdf`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  cancelContract: async (id, reason, remarks) => {
    const res = await api.put(`/contracts/${id}`, { status: "Cancelled", cancelReason: reason || null, cancelRemarks: remarks || null });
    return res.data;
  },

  // `products` is [{productName, model}] — matches Item Master by name first,
  // then falls back to matching the contract's separate model field.
  checkProductsInInventory: async (products) => {
    const res = await api.post("/contracts/check-products", { products });
    return res.data?.data || [];
  },

  // Returns { exists, reason: "duplicate"|"order", orderStatus? } so the
  // caller can distinguish "this contract was already uploaded" from
  // "this contract already has an order in Order Processing".
  checkContractNumberExists: async (contractNumber) => {
    if (!contractNumber?.trim()) return { exists: false };
    try {
      const res = await api.get(`/contracts/check?contractNumber=${encodeURIComponent(contractNumber.trim())}`);
      return res.data || { exists: false };
    } catch (error) {
      console.warn("Failed to check contract number:", error.message);
      return { exists: false };
    }
  },
};
