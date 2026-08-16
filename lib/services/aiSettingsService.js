"use client";

import api from "@/lib/client/apiClient";

export const aiSettingsService = {
  getSettings: async () => {
    const res = await api.get("/admin/ai-settings");
    return res.data;
  },

  saveKey: async (apiKey) => {
    const res = await api.put("/admin/ai-settings", { apiKey });
    return res.data;
  },

  getUsage: async (params = {}) => {
    const res = await api.get("/admin/ai-usage", { params });
    return res.data;
  },
};
