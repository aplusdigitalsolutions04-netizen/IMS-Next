"use client";

import api from "@/lib/client/apiClient";

export const contractGroupsService = {
  list: async (companyGuid) => (await api.get(`/contract-groups?_t=${Date.now()}${companyGuid ? `&companyGuid=${encodeURIComponent(companyGuid)}` : ""}`)).data,
  summary: async () => (await api.get(`/contract-groups/summary?_t=${Date.now()}`)).data,
  suggest: async (fields) => (await api.post("/contract-groups/suggest", { fields })).data.clusters,
  create: async (payload) => (await api.post("/contract-groups", payload)).data,
  get: async (id) => (await api.get(`/contract-groups/${id}?_t=${Date.now()}`)).data,
  update: async (id, data) => (await api.put(`/contract-groups/${id}`, data)).data,
  remove: async (id) => (await api.delete(`/contract-groups/${id}`)).data,
  addSources: async (id, payload) => (await api.post(`/contract-groups/${id}/add`, payload)).data,
  addClient: async (id) => (await api.post(`/contract-groups/${id}/client`)).data,
  updateRow: async (id, rowId, data) => (await api.put(`/contract-groups/${id}/rows/${rowId}`, data)).data,
  removeRow: async (id, rowId) => (await api.delete(`/contract-groups/${id}/rows/${rowId}`)).data,
  refreshRow: async (id, rowId) => (await api.post(`/contract-groups/${id}/rows/${rowId}`)).data,
  addStatus: async (data) => (await api.post("/contract-groups/commission-statuses", data)).data,
  updateStatus: async (data) => (await api.put("/contract-groups/commission-statuses", data)).data,
  deleteStatus: async (guid) => (await api.delete(`/contract-groups/commission-statuses?guid=${encodeURIComponent(guid)}`)).data,
  addColumn: async (data) => (await api.post("/contract-groups/columns", data)).data,
  deleteColumn: async (guid) => (await api.delete(`/contract-groups/columns?guid=${encodeURIComponent(guid)}`)).data,
};

export const MATCH_FIELD_OPTIONS = [
  { key: "buyerAddress", label: "Address" },
  { key: "buyerGstin", label: "GSTIN" },
  { key: "buyerEmail", label: "Email ID" },
  { key: "department", label: "Department" },
  { key: "organisation", label: "Organisation" },
  { key: "ministry", label: "Ministry" },
];
