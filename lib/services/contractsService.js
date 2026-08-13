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

  deleteContract: async (id) => {
    const res = await api.delete(`/contracts/${id}`);
    return res.data;
  },

  updateContract: async (id, data) => {
    const res = await api.put(`/contracts/${id}`, data);
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
