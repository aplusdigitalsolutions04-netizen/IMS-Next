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

  addPlatform: async (name, colorTheme, itemTypeMode) => {
    const res = await api.post("/admin/platforms", { name, colorTheme, itemTypeMode });
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

  setPlatformItemTypeMode: async (guid, itemTypeMode) => {
    const res = await api.put(`/admin/platforms/${guid}`, { itemTypeMode });
    return res.data;
  },

  deletePlatform: async (guid) => {
    const res = await api.delete(`/admin/platforms/${guid}`);
    return res.data;
  },

  getPlatformFields: async (guid) => {
    const res = await api.get(`/admin/platforms/${guid}/fields`);
    return res.data?.data || [];
  },

  addPlatformField: async (guid, fieldData) => {
    const res = await api.post(`/admin/platforms/${guid}/fields`, fieldData);
    return res.data;
  },

  updatePlatformField: async (platformGuid, fieldGuid, fieldData) => {
    const res = await api.put(`/admin/platforms/${platformGuid}/fields/${fieldGuid}`, fieldData);
    return res.data;
  },

  deletePlatformField: async (platformGuid, fieldGuid) => {
    const res = await api.delete(`/admin/platforms/${platformGuid}/fields/${fieldGuid}`);
    return res.data;
  },
};
