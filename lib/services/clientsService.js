"use client";

import api from "@/lib/client/apiClient";

export const clientsService = {
  getClients: async () => {
    const res = await api.get(`/clients?_t=${new Date().getTime()}`);
    return res.data;
  },

  addClient: async (data) => {
    const res = await api.post("/clients", data);
    return res.data;
  },

  updateClient: async (id, data) => {
    const res = await api.put(`/clients/${id}`, data);
    return res.data;
  },

  deleteClient: async (id) => {
    const res = await api.delete(`/clients/${id}`);
    return res.data;
  },
};
