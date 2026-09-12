"use client";

import api from "@/lib/client/apiClient";

export const carePackService = {
  getAll: async () => {
    const res = await api.get("/admin/care-pack");
    return res.data?.data || [];
  },

  add: async (name) => {
    const res = await api.post("/admin/care-pack", { name });
    return res.data;
  },

  rename: async (guid, name) => {
    const res = await api.put(`/admin/care-pack/${guid}`, { name });
    return res.data;
  },

  setActive: async (guid, isActive) => {
    const res = await api.put(`/admin/care-pack/${guid}`, { isActive });
    return res.data;
  },

  remove: async (guid) => {
    const res = await api.delete(`/admin/care-pack/${guid}`);
    return res.data;
  },
};
