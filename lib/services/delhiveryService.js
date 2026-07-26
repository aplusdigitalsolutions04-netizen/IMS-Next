"use client";

import api from "@/lib/client/apiClient";

export const delhiveryService = {
  getConfigStatus: async () => {
    const res = await api.get("/delhivery/config-status");
    return res.data;
  },

  createShipment: async (data) => {
    const res = await api.post("/delhivery/create-shipment", data);
    return res.data;
  },

  createB2BShipment: async (data) => {
    const res = await api.post("/delhivery-b2b/create-shipment", data);
    return res.data;
  },

  trackShipment: async (waybill) => {
    const res = await api.get(`/delhivery/track/${encodeURIComponent(waybill)}`);
    return res.data;
  },

  checkPincode: async (data) => {
    const res = await api.post("/delhivery/check-pincode", data);
    return res.data;
  },

  requestPickup: async (data) => {
    const res = await api.post("/delhivery/pickup-request", data);
    return res.data;
  },
};
