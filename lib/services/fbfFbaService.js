"use client";

import api from "@/lib/client/apiClient";

export const fbfFbaService = {
  getFbfFbaStock: async (type) => {
    const res = await api.get(`/fbf-fba/stock?type=${type}&_t=${new Date().getTime()}`);
    return res.data;
  },

  addFbfFbaStock: async (data) => {
    const res = await api.post("/fbf-fba/add-stock", data);
    return res.data;
  },

  updateFbfFbaStock: async (guid, data) => {
    const res = await api.put(`/fbf-fba/stock/${guid}`, data);
    return res.data;
  },

  sellFbfFbaStock: async (data) => {
    const res = await api.post("/fbf-fba/sell-out", data);
    return res.data;
  },

  getFbfFbaSellOutHistory: async (type) => {
    const params = new URLSearchParams({ transactionType: "OUT", _t: new Date().getTime() });
    if (type) params.set("type", type);
    const res = await api.get(`/fbf-fba/transactions?${params.toString()}`);
    return res.data;
  },

  // Single-serial, on-demand lookup — used by the global search modal so it
  // doesn't have to eagerly load every FBF/FBA sell-out on every page load.
  getFbfFbaSellOutForSerial: async (serialNumber) => {
    const params = new URLSearchParams({ transactionType: "OUT", serialNumber, _t: new Date().getTime() });
    const res = await api.get(`/fbf-fba/transactions?${params.toString()}`);
    return Array.isArray(res.data) ? res.data[0] || null : null;
  },

  lookupFbfFbaReturn: async ({ serialNumber, itemId }) => {
    const params = new URLSearchParams();
    if (serialNumber) params.set("serialNumber", serialNumber);
    if (itemId) params.set("itemId", itemId);
    const res = await api.get(`/fbf-fba/return-lookup?${params.toString()}`);
    return res.data;
  },

  returnFbfFbaStock: async (data) => {
    const res = await api.post("/fbf-fba/return", data);
    return res.data;
  },

  getFbfFbaReports: async () => {
    const res = await api.get("/reports/fbf-fba");
    return res.data;
  },

  getFbfFbaPlatforms: async () => {
    const res = await api.get("/fbf-fba-master/platforms");
    return res.data;
  },

  addFbfFbaPlatform: async (data) => {
    const res = await api.post("/fbf-fba-master/platforms", data);
    return res.data;
  },

  deleteFbfFbaPlatform: async (id) => {
    const res = await api.delete(`/fbf-fba-master/platforms/${id}`);
    return res.data;
  },

  getFbfFbaStates: async () => {
    const res = await api.get("/fbf-fba-master/states");
    return res.data;
  },

  addFbfFbaState: async (data) => {
    const res = await api.post("/fbf-fba-master/states", data);
    return res.data;
  },

  deleteFbfFbaState: async (id) => {
    const res = await api.delete(`/fbf-fba-master/states/${id}`);
    return res.data;
  },

  getFbfFbaWarehouses: async () => {
    const res = await api.get("/fbf-fba-master/warehouses");
    return res.data;
  },

  addFbfFbaWarehouse: async (data) => {
    const res = await api.post("/fbf-fba-master/warehouses", data);
    return res.data;
  },

  updateFbfFbaWarehouse: async (id, data) => {
    const res = await api.put(`/fbf-fba-master/warehouses/${id}`, data);
    return res.data;
  },

  deleteFbfFbaWarehouse: async (id) => {
    const res = await api.delete(`/fbf-fba-master/warehouses/${id}`);
    return res.data;
  },
};
