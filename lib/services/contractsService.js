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

  checkProductsInInventory: async (productNames) => {
    const res = await api.post("/contracts/check-products", { productNames });
    return res.data?.data || [];
  },

  checkContractNumberExists: async (contractNumber) => {
    if (!contractNumber?.trim()) return false;
    try {
      const res = await api.get(`/contracts/check?contractNumber=${encodeURIComponent(contractNumber.trim())}`);
      return !!res.data?.exists;
    } catch (error) {
      console.warn("Failed to check contract number:", error.message);
      return false;
    }
  },
};
