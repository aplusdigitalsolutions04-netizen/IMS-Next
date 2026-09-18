"use client";

import api from "@/lib/client/apiClient";

export const deletedItemsService = {
  getDeletedItems: async (type, search = "") => {
    const params = new URLSearchParams({ type });
    if (search) params.append("search", search);
    const res = await api.get(`/admin/deleted-items?${params.toString()}`);
    return res.data?.data || [];
  },

  restore: async (type, id, remarks) => {
    const res = await api.post("/admin/deleted-items/restore", { type, id, remarks });
    return res.data;
  },
};
