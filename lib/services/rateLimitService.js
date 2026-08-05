"use client";

import api from "@/lib/client/apiClient";

export const rateLimitService = {
  getStatus: async () => {
    const res = await api.get("/admin/rate-limit");
    return res.data;
  },
  updateRule: async (guid, { windowMs, maxRequests }) => {
    const res = await api.put(`/admin/rate-limit/${guid}`, { windowMs, maxRequests });
    return res.data;
  },
  resetCounter: async (ruleKey, ip) => {
    const res = await api.post("/admin/rate-limit/reset", { ruleKey, ip });
    return res.data;
  },
};
