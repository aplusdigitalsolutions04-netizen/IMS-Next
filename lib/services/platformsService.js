"use client";

import api from "@/lib/client/apiClient";

export const platformsService = {
  // Active platforms only — this is what every order/dispatch/company form
  // dropdown should use instead of a hardcoded list.
  getPlatforms: async () => {
    try {
      const res = await api.get("/platforms");
      return res.data?.data || [];
    } catch (error) {
      console.warn("Failed to load platforms:", error.message);
      return [];
    }
  },

  // Admin-only management (includes inactive rows + isSystem flag).
  getAllPlatforms: async () => {
    const res = await api.get("/admin/platforms");
    return res.data?.data || [];
  },

  addPlatform: async (name, colorTheme) => {
    const res = await api.post("/admin/platforms", { name, colorTheme });
    return res.data;
  },

  renamePlatform: async (guid, name) => {
    const res = await api.put(`/admin/platforms/${guid}`, { name });
    return res.data;
  },

  setPlatformActive: async (guid, isActive) => {
    const res = await api.put(`/admin/platforms/${guid}`, { isActive });
    return res.data;
  },

  setPlatformColor: async (guid, colorTheme) => {
    const res = await api.put(`/admin/platforms/${guid}`, { colorTheme });
    return res.data;
  },

  deletePlatform: async (guid) => {
    const res = await api.delete(`/admin/platforms/${guid}`);
    return res.data;
  },
};
