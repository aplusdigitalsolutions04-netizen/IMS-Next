"use client";

import api from "@/lib/client/apiClient";

export const deliveryPartnersService = {
  getAll: async () => {
    const res = await api.get("/admin/delivery-partners");
    return res.data?.data || [];
  },

  add: async (name) => {
    const res = await api.post("/admin/delivery-partners", { name });
    return res.data;
  },

  rename: async (guid, name) => {
    const res = await api.put(`/admin/delivery-partners/${guid}`, { name });
    return res.data;
  },

  setActive: async (guid, isActive) => {
    const res = await api.put(`/admin/delivery-partners/${guid}`, { isActive });
    return res.data;
  },

  remove: async (guid) => {
    const res = await api.delete(`/admin/delivery-partners/${guid}`);
    return res.data;
  },
};
